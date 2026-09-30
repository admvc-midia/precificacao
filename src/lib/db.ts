import { PrismaClient } from '@prisma/client';

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

function avisarSeLigacaoErrada(): void {
  const url = process.env.DATABASE_URL;

  // O caso mais importante e o que faltava aqui: a variavel **ausente**. Sem
  // ela o Prisma rebenta na primeira consulta, e em producao isso chega ao
  // browser como um erro generico de render que nao aponta para nada.
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
  const serverless = Boolean(process.env.VERCEL);
  if (!serverless) return;

  if (/pooler\.supabase\.com:5432/.test(url)) {
    console.error(
      '[precificaragao] DATABASE_URL usa o pooler do Supabase em modo sessao ' +
        '(porta 5432). Em serverless isso esgota as ligacoes e as paginas ' +
        'rebentam com um erro generico. Use a porta 6543 e acrescente ' +
        '`pgbouncer=true&connection_limit=1`.',
    );
  }

  if (!/[?&]schema=/.test(url)) {
    console.error(
      '[precificaragao] DATABASE_URL nao diz o schema. Esta base e partilhada ' +
        'com outro projeto: sem `?schema=precificaragao` a aplicacao procura ' +
        'as tabelas no schema `public`, onde elas nao estao.',
    );
  }
}

avisarSeLigacaoErrada();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
