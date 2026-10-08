import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

/**
 * Em dev o Next.js recarrega os modulos a cada edicao; sem este cache global
 * cada reload abriria uma nova pool de ligacoes ate o Postgres recusar.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Avisa quando a ligacao nao serve para onde a aplicacao esta a correr.
 *
 * ---------------------------------------------------------------------------
 * PORQUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * O Supabase tem dois poolers na mesma maquina, e so o numero da porta os
 * distingue:
 *
 *   :5432  modo **sessao** — segura uma ligacao ao Postgres do principio ao
 *          fim de cada cliente. Serve para um servidor que corre sempre, ou
 *          para scripts. Tem um tecto baixo (15 por omissao).
 *   :6543  modo **transacao** — devolve a ligacao ao fim de cada transacao.
 *          E o que serve para serverless.
 *
 * Em serverless cada invocacao e um cliente novo. Com o pooler de sessao, meia
 * duzia de pedidos simultaneos esgota os 15 lugares e o Postgres recusa com
 * `EMAXCONNSESSION`. Do lado do browser isso aparece como um erro generico de
 * render — sem nada que aponte para a porta errada numa variavel de ambiente.
 *
 * Nao rebenta aqui de proposito: uma aplicacao que se recusa a arrancar por
 * causa de um aviso e pior que uma que funciona e se queixa. O aviso sai nos
 * logs, que e onde alguem vai procurar quando isto falhar.
 */

/** Nomes que a integracao Vercel–Supabase/Neon cria sozinha. */
const NOMES_DA_INTEGRACAO = [
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
];

function avisarSeLigacaoErrada(url: string | undefined): void {
  // O caso mais importante: a variavel **ausente**. Sem ela nenhuma consulta
  // funciona, e em producao isso chega ao browser como um erro generico.
  if (!url) {
    const daIntegracao = NOMES_DA_INTEGRACAO.filter((n) => process.env[n]);
    console.error(
      '[precificaragao] DATABASE_URL nao esta definida. Nenhuma pagina que leia ' +
        'dados vai conseguir abrir.' +
        (daIntegracao.length > 0
          ? ` Existem ${daIntegracao.join(', ')}, criadas pela integracao com o ` +
            'fornecedor do banco — mas esta aplicacao le DATABASE_URL, e essas ' +
            'nao trazem o `?schema=`, que aqui nao e opcional porque a base e ' +
            'partilhada. Defina DATABASE_URL a mao.'
          : ''),
    );
    return;
  }

  if (process.env.NODE_ENV !== 'production') return;
  // `VERCEL` so existe la; nao ha pacote nenhum para isto.
  if (!process.env.VERCEL) return;

  if (/pooler\.supabase\.com:5432/.test(url)) {
    console.error(
      '[precificaragao] DATABASE_URL usa o pooler do Supabase em modo sessao ' +
        '(porta 5432). Em serverless isso esgota as ligacoes e as paginas ' +
        'rebentam com um erro generico. Use a porta 6543 e acrescente ' +
        '`pgbouncer=true&connection_limit=1`.',
    );
  }
}

export interface Ligacao {
  /** O endereco para o `pg`, sem os parametros que so o Prisma conhecia. */
  connectionString: string;
  /** O schema onde estao as tabelas desta app. */
  schema: string;
  /** Tecto de ligacoes da pool (o `connection_limit` do endereco). */
  max: number;
  /** TLS sem verificar o certificado, como o Prisma 5 fazia; `false` com `sslmode=disable`. */
  ssl: false | { rejectUnauthorized: false };
}

/**
 * Traduz o DATABASE_URL (escrito para o Prisma 5) para o adaptador `pg` do
 * Prisma 7.
 *
 * - **`schema`**: o adaptador nao le o `?schema=` do endereco — sem o passar
 *   a mao, as consultas iam ao schema `public`, que nesta base e de OUTRO
 *   projeto (o ADMVC). Por isso, sem `?schema=` **rebenta**, em vez de cair no
 *   `public` em silencio.
 * - **`connection_limit`**: o `pg` nao o conhece e abriria ate 10 ligacoes;
 *   localmente isso esgota o pooler (15 lugares), na Vercel deve ser 1.
 * - **`sslmode`**: o Prisma 5 cifrava sem verificar o certificado
 *   (`sslaccept=accept_invalid_certs`); o `pg` trataria `require` como
 *   verificacao completa, e o certificado do pooler do Supabase falha-a.
 * - **`pgbouncer`**: so dizia ao Prisma 5 para nao usar prepared statements com
 *   nome; o `pg` ja nao os usa. Sai.
 */
export function ligacaoDoEndereco(url: string): Ligacao {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('[precificaragao] DATABASE_URL nao e um endereco valido.');
  }
  const schema = u.searchParams.get('schema');
  if (!schema) {
    throw new Error(
      '[precificaragao] DATABASE_URL nao diz o schema. Esta base e partilhada com ' +
        'outro projeto: sem `?schema=precificaragao` a aplicacao ia ler e escrever ' +
        'no schema `public`, que nao e dela. Acrescente o `?schema=` ao endereco.',
    );
  }
  const limite = Number(u.searchParams.get('connection_limit'));
  const sslmode = u.searchParams.get('sslmode');
  for (const p of ['schema', 'connection_limit', 'pgbouncer', 'sslmode', 'sslaccept', 'pool_timeout', 'connect_timeout']) {
    u.searchParams.delete(p);
  }
  return {
    connectionString: u.toString(),
    schema,
    max: Number.isInteger(limite) && limite > 0 ? limite : 5,
    ssl: sslmode === 'disable' ? false : { rejectUnauthorized: false },
  };
}

/** Sem endereco (o CI, os testes sem base) nao se rebenta ao importar, como no Prisma 5. */
const SEM_ENDERECO = 'postgresql://sem-database-url.invalid/x?schema=sem_database_url';

/**
 * O schema da app, ja entre aspas, para o SQL escrito a mao:
 * `FROM ${tabela('CustomerOrder')}`.
 *
 * Obrigatorio em todo o `$queryRaw`/`$executeRaw`: o adaptador do Prisma 7 so
 * poe o schema nas consultas que ele proprio gera, e nao muda o `search_path`
 * da ligacao. Um nome de tabela sem schema ia parar ao `public` — que nesta
 * base e de outro projeto.
 */
export function tabela(nome: string): string {
  const aspas = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return `${aspas(ligacaoDoEndereco(process.env.DATABASE_URL || SEM_ENDERECO).schema)}.${aspas(nome)}`;
}

function novoCliente(): PrismaClient {
  const url = process.env.DATABASE_URL;
  avisarSeLigacaoErrada(url);
  // A primeira consulta sem endereco falha, e o aviso acima ja disse porque.
  const l = ligacaoDoEndereco(url || SEM_ENDERECO);
  const adapter = new PrismaPg(
    {
      connectionString: l.connectionString,
      max: l.max,
      ssl: l.ssl,
      // O `pg`, por omissao, espera PARA SEMPRE: por uma ligacao livre, e por
      // uma resposta numa ligacao que o pooler do Supabase cortou em silencio.
      // O motor do Prisma 5 recuperava disso; aqui um teste ficou pendurado 38
      // minutos. Com estes limites, uma ligacao morta da erro em segundos.
      keepAlive: true,
      connectionTimeoutMillis: 15_000,
      query_timeout: 60_000,
      idleTimeoutMillis: 10_000,
    },
    { schema: l.schema },
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? novoCliente();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
