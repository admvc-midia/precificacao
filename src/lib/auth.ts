/**
 * Quem entra na aplicacao, e onde pode ir.
 *
 * ---------------------------------------------------------------------------
 * DE UMA PALAVRA-PASSE PARA CONTAS
 * ---------------------------------------------------------------------------
 * Ate aqui havia uma palavra-passe partilhada, porque nada na aplicacao
 * distinguia pessoas. O livro de receitas mudou isso: as receitas tem
 * versoes com autor, e so quem esta autorizado as pode alterar. Entao ha
 * contas, com tres perfis (ver `UserRole` no schema).
 *
 * Duas variaveis de ambiente, cada uma com o seu trabalho:
 *  - **`SESSION_SECRET`** assina os cookies. Longa e aleatoria (32 caracteres
 *    ou mais), nunca escrita a mao: quem a adivinhasse forjava uma sessao de
 *    dono. Ate 7/10 a chave saia da APP_PASSWORD, que e uma frase que se
 *    escreve — curta demais para aguentar quem tente adivinhar a partir de
 *    um cookie apanhado. Troca-la expulsa toda a gente.
 *  - **`APP_PASSWORD`** so abre a porta a primeira conta de dono, quando
 *    ainda nao ha nenhuma. Depois disso deixa de servir para entrar.
 *
 * Sem as duas, ninguem entra (fecha por omissao).
 * * ---------------------------------------------------------------------------
 * O QUE O COOKIE DIZ E O QUE NAO DIZ
 * ---------------------------------------------------------------------------
 * O cookie leva a conta, o perfil, a "versao de sessao" e o prazo, assinados.
 * O proxy decide as rotas so com ele, sem ir a base. Mas o cookie e uma
 * fotografia: quem for desativado continuaria com um cookie valido. Por isso
 * as paginas (no layout) e as actions confirmam na base que a conta esta
 * ativa, com o mesmo perfil e a mesma versao — ver `lib/sessao.ts`.
 *
 * Nao ha aqui nada do Prisma nem do React de proposito — isto corre tambem no
 * `proxy.ts`, antes de qualquer pagina existir.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

export const COOKIE = 'precificaragao_sessao';

export type Perfil = 'OWNER' | 'KITCHEN' | 'READER';

export const PERFIL_LABEL: Record<Perfil, string> = {
  OWNER: 'Dono',
  KITCHEN: 'Cozinha',
  READER: 'Leitura',
};

/**
 * Quanto dura uma sessao. Por omissao, um dia de trabalho: um telemovel
 * esquecido na cozinha com a sessao do dono aberta mostrava os custos a quem
 * pegasse nele. Quem marca "manter neste aparelho" fica 30 dias — e o
 * telemovel de cada um, onde pedir a palavra-passe a cada compra era
 * garantir que alguem a escrevia num papel.
 */
export const DURACAO_CURTA_MS = 12 * 60 * 60 * 1000;
export const DURACAO_LONGA_MS = 30 * 24 * 60 * 60 * 1000;

/** Tamanho minimo do segredo das sessoes. */
export const SEGREDO_MINIMO = 32;

/** A palavra-passe de arranque, ou `null` se ninguem a definiu. */
export function palavraPasse(): string | null {
  const v = process.env.APP_PASSWORD?.trim();
  return v ? v : null;
}

/** O segredo que assina as sessoes, ou `null` se falta ou e curto demais. */
export function segredoDasSessoes(): string | null {
  const v = process.env.SESSION_SECRET?.trim();
  return v && v.length >= SEGREDO_MINIMO ? v : null;
}

/** Se a aplicacao esta configurada. Falso: ninguem entra (fecha por omissao). */
export function protegida(): boolean {
  return palavraPasse() !== null && segredoDasSessoes() !== null;
}

/** Um segredo novo, para a SESSION_SECRET: 48 bytes aleatorios. */
export function novoSegredo(): string {
  return randomBytes(48).toString('base64url');
}

function chave(segredo: string): Buffer {
  // O sufixo separa esta utilizacao de qualquer outra que se faca do mesmo
  // segredo mais tarde.
  return createHash('sha256').update(`${segredo}:cookie-de-sessao`).digest();
}

function assina(dados: string, segredo: string): string {
  return createHmac('sha256', chave(segredo)).update(dados).digest('base64url');
}

/** Compara sem deixar o tempo de resposta dizer quantos caracteres acertaram. */
function iguais(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/** Confere a palavra-passe de arranque (so serve para criar o primeiro dono). */
export function acertou(tentativa: string): boolean {
  const certa = palavraPasse();
  if (certa === null) return false;
  return iguais(tentativa, certa);
}

// ---------------------------------------------------------------------------
// Sessao
// ---------------------------------------------------------------------------

export interface Sessao {
  userId: string;
  perfil: Perfil;
  /** Tem de bater com `User.sessionVersion`; subir la termina esta sessao. */
  versao: number;
  expira: number;
}

const PERFIS: Perfil[] = ['OWNER', 'KITCHEN', 'READER'];

/** O valor a guardar no cookie: os dados em base64url, e a assinatura deles. */
export function novaSessao(
  quem: { userId: string; perfil: Perfil; versao: number },
  agora = Date.now(),
  duracaoMs = DURACAO_CURTA_MS,
): { valor: string; expiraEm: Date } {
  const segredo = segredoDasSessoes();
  if (segredo === null) throw new Error('Sem SESSION_SECRET definida.');

  const expira = agora + duracaoMs;
  const dados = Buffer.from(
    JSON.stringify({ u: quem.userId, p: quem.perfil, v: quem.versao, e: expira }),
  ).toString('base64url');
  return { valor: `${dados}.${assina(dados, segredo)}`, expiraEm: new Date(expira) };
}

/**
 * Le e confere o cookie: assinado por nos, com forma certa, dentro do prazo.
 *
 * O prazo vai **dentro** do que e assinado. O prazo do cookie e uma sugestao
 * ao browser; este e o que conta.
 */
export function lerSessao(valor: string | undefined, agora = Date.now()): Sessao | null {
  const segredo = segredoDasSessoes();
  if (segredo === null || !valor) return null;

  const corte = valor.lastIndexOf('.');
  if (corte <= 0) return null;
  const dados = valor.slice(0, corte);
  const assinatura = valor.slice(corte + 1);
  if (!iguais(assinatura, assina(dados, segredo))) return null;

  try {
    const o = JSON.parse(Buffer.from(dados, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (
      typeof o.u !== 'string' ||
      !PERFIS.includes(o.p as Perfil) ||
      typeof o.v !== 'number' ||
      typeof o.e !== 'number'
    ) {
      return null;
    }
    if (o.e <= agora) return null;
    return { userId: o.u, perfil: o.p as Perfil, versao: o.v, expira: o.e };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Palavras-passe
// ---------------------------------------------------------------------------

/**
 * scrypt: lento de proposito, e com memoria, o que encarece as placas
 * graficas de quem tente adivinhar a partir de uma copia da base.
 * N = 2^15 fica em ~100 ms aqui — imperceptivel a quem entra, caro a quem
 * tenta milhoes.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const TAMANHO = 64;

function scrypt(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(senha, sal, TAMANHO, opcoes, (err, chaveDerivada) =>
      err ? reject(err) : resolve(chaveDerivada),
    ),
  );
}

/** "scrypt$N$r$p$sal$hash" — os parametros vao junto, para se poderem subir mais tarde. */
export async function hashPalavraPasse(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scrypt(senha, sal, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), h.toString('base64')].join('$');
}

export async function confereHash(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await scrypt(senha, Buffer.from(sal, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

/**
 * Um hash qualquer, para gastar o mesmo tempo quando a conta nao existe —
 * senao a demora da resposta dizia que nomes de utilizador existem.
 */
export const HASH_FALSO =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(TAMANHO).toString('base64');

/** O que se exige a uma palavra-passe nova. `null` se serve. */
export function problemaNaPalavraPasse(senha: string, utilizador: string): string | null {
  if (senha.length < 10) return 'A palavra-passe tem de ter pelo menos 10 caracteres.';
  if (senha.toLowerCase().includes(utilizador.toLowerCase())) {
    return 'A palavra-passe nao pode conter o nome de utilizador.';
  }
  if (/^(.)\1+$/.test(senha)) return 'A palavra-passe nao pode ser so o mesmo caracter.';
  return null;
}

/** Nome de utilizador: minusculas, letras, numeros, ponto, hifen. */
export function normalizarUtilizador(raw: string): string {
  return raw.trim().toLowerCase();
}

export function utilizadorValido(u: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(u);
}

// ---------------------------------------------------------------------------
// Bloqueio por tentativas
// ---------------------------------------------------------------------------

export const TENTATIVAS_MAX = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

/** Depois de uma falha: quantas leva, e se fica bloqueada (e ate quando). */
export function depoisDeFalhar(
  falhas: number,
  agora = Date.now(),
): { failedLogins: number; lockedUntil: Date | null } {
  const n = falhas + 1;
  if (n >= TENTATIVAS_MAX) return { failedLogins: 0, lockedUntil: new Date(agora + BLOQUEIO_MS) };
  return { failedLogins: n, lockedUntil: null };
}

// ---------------------------------------------------------------------------
// Bloqueio por origem
// ---------------------------------------------------------------------------

/** Falhas da mesma origem, em qualquer conta, dentro da janela, ate bloquear. */
export const ORIGEM_FALHAS_MAX = 20;
export const ORIGEM_JANELA_MS = 15 * 60 * 1000;
export const ORIGEM_BLOQUEIO_MS = 15 * 60 * 1000;

/**
 * De onde vem o pedido, para contar as falhas.
 *
 * Na Vercel o `x-real-ip` e posto por ela e nao pelo browser; o primeiro do
 * `x-forwarded-for` fica como recurso. Um IPv6 conta pelo bloco /64: cada
 * casa tem milhoes de enderecos nesse bloco, e contar um a um deixava quem
 * tenta dar a volta ao limite so trocando de endereco.
 */
export function chaveDaOrigem(realIp: string | null, forwardedFor: string | null): string {
  const ip = (realIp ?? forwardedFor?.split(',')[0] ?? '').trim().toLowerCase();
  if (!ip) return 'desconhecida';
  // IPv4 escrito a maneira do IPv6 ("::ffff:203.0.113.7") e um IPv4.
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapeado) return mapeado[1];
  if (!ip.includes(':')) return ip;
  const grupos = expandirIPv6(ip);
  return grupos ? `${grupos.slice(0, 4).join(':')}::/64` : ip;
}

/**
 * "2001:db8::1" → os 8 grupos por extenso. Sem isto, cortar nos primeiros 4
 * grupos de um endereco abreviado dava um bloco errado — dois enderecos da
 * mesma casa contavam como origens diferentes. `null` se nao for IPv6.
 */
function expandirIPv6(ip: string): string[] | null {
  const semZona = ip.split('%')[0];
  const partes = semZona.split('::');
  if (partes.length > 2) return null;
  const esquerda = partes[0] ? partes[0].split(':') : [];
  const direita = partes.length === 2 && partes[1] ? partes[1].split(':') : [];
  const faltam = 8 - esquerda.length - direita.length;
  if (partes.length === 1 ? faltam !== 0 : faltam < 1) return null;
  const grupos = [...esquerda, ...Array<string>(partes.length === 2 ? faltam : 0).fill('0'), ...direita];
  if (!grupos.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.map((g) => g.replace(/^0+(?=.)/, ''));
}

/** O estado da origem depois de mais uma falha. */
export function origemDepoisDeFalhar(
  estado: { failures: number; windowStart: Date } | null,
  agora = Date.now(),
): { failures: number; windowStart: Date; lockedUntil: Date | null } {
  // Fora da janela, a contagem recomeca.
  const naJanela = estado && agora - estado.windowStart.getTime() < ORIGEM_JANELA_MS;
  const failures = (naJanela ? estado.failures : 0) + 1;
  const windowStart = naJanela ? estado.windowStart : new Date(agora);
  if (failures >= ORIGEM_FALHAS_MAX) {
    return { failures: 0, windowStart: new Date(agora), lockedUntil: new Date(agora + ORIGEM_BLOQUEIO_MS) };
  }
  return { failures, windowStart, lockedUntil: null };
}

// ---------------------------------------------------------------------------
// Onde cada perfil pode ir
// ---------------------------------------------------------------------------

/**
 * Abertas sem sessao: a porta, a saida (que apaga um cookie que ja nao vale)
 * e o cardapio publico, que e o link da bio do Instagram.
 */
const SEM_SESSAO = new Set(['/entrar', '/sair', '/cardapio']);

/**
 * As fotos do cardapio publico (itens e capas das secoes). As rotas so
 * entregam a foto de um item ou secao publicados (ver `api/cardapio/foto/`),
 * por isso podem estar abertas; as outras fotos (`/api/fotos`) continuam
 * atras do login.
 */
const FOTOS_DO_CARDAPIO = /^\/api\/cardapio\/foto\/(?:secao\/)?[A-Za-z0-9_-]+$/;

/** O porteiro (`proxy.ts`) deixa passar sem sessao? */
export function abertaSemSessao(pathname: string): boolean {
  return SEM_SESSAO.has(pathname) || FOTOS_DO_CARDAPIO.test(pathname);
}

/**
 * O que a cozinha e a leitura podem abrir. Tudo o resto — custos, clientes,
 * configuracoes — e so do dono. Lista do que se pode, e nao do que nao se
 * pode: uma pagina nova nasce fechada a quem nao e dono.
 */
const ROTAS_DO_LIVRO = ['/receitas', '/livros', '/api/receitas', '/conta', '/ajuda'];

/**
 * A cozinha ve tambem as encomendas e a producao — o que fazer e para quando
 * — mas as paginas mostram-lhe so isso, sem precos nem custos. Criar uma
 * encomenda nao: o formulario e todo precos.
 */
const ROTAS_DA_COZINHA = ['/encomendas', '/producao', '/calendario'];
const FECHADAS_A_COZINHA = ['/encomendas/nova'];

function casa(lista: string[], pathname: string): boolean {
  return lista.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function rotaPermitida(perfil: Perfil, pathname: string): boolean {
  if (perfil === 'OWNER') return true;
  if (casa(ROTAS_DO_LIVRO, pathname)) return true;
  return perfil === 'KITCHEN' && casa(ROTAS_DA_COZINHA, pathname) && !casa(FECHADAS_A_COZINHA, pathname);
}

/**
 * O "de" da pagina de entrada, se for um caminho deste sitio; senao `null`.
 *
 * Nao chega ver se comeca por "/" e nao por "//": o browser trata "/\outro.com"
 * (e variantes com tabs e quebras de linha pelo meio) como "//outro.com", e o
 * login verdadeiro mandava a pessoa para uma pagina falsa. Aqui o caminho e
 * lido como o browser o leria, contra uma origem inventada, e so passa se a
 * origem continuar a mesma.
 */
export function destinoInterno(valor: string): string | null {
  if (!valor.startsWith('/')) return null;
  const BASE = 'https://destino.invalid';
  try {
    const u = new URL(valor, BASE);
    if (u.origin !== BASE) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/** Para onde vai cada perfil ao entrar, ou quando bate numa porta fechada. */
export function inicioDoPerfil(perfil: Perfil): string {
  // A cozinha comeca o dia pelo que ha para fazer.
  return perfil === 'OWNER' ? '/' : perfil === 'KITCHEN' ? '/encomendas' : '/receitas';
}

/** Quem pode alterar o livro (criar receitas e versoes, organizar livros). */
export function podeEditarLivro(perfil: Perfil): boolean {
  return perfil === 'OWNER' || perfil === 'KITCHEN';
}
