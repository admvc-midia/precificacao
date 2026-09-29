/**
 * Quem entra na aplicacao.
 *
 * ---------------------------------------------------------------------------
 * UMA PALAVRA-PASSE, NAO CONTAS DE UTILIZADOR
 * ---------------------------------------------------------------------------
 * Isto e a ferramenta de custos de **uma** casa, usada por quem la trabalha.
 * Nao ha nada na aplicacao que pertenca a um utilizador e nao a outro: nao ha
 * autoria, nao ha permissoes, nao ha historico por pessoa. Contas com email e
 * recuperacao de palavra-passe seriam trabalho e superficie de ataque para
 * distinguir pessoas que a aplicacao nao precisa de distinguir.
 *
 * Entao: uma palavra-passe partilhada em `APP_PASSWORD`, e um cookie assinado
 * a dizer "esta pessoa acertou". E o suficiente para o problema real, que e
 * **a aplicacao estar publicada aberta**, com precos e estoque a mercê de
 * quem apanhe o link.
 *
 * ---------------------------------------------------------------------------
 * PORQUE A CHAVE SAI DA PALAVRA-PASSE
 * ---------------------------------------------------------------------------
 * A chave que assina o cookie e derivada da propria palavra-passe, em vez de
 * ser uma segunda variavel de ambiente. Duas razoes:
 *
 *  - **Uma variavel e que se poe; duas e que se esquecem.** Uma configuracao
 *    de seguranca que fica por fazer nao protege nada.
 *  - **Trocar a palavra-passe passa a expulsar toda a gente**, que e
 *    exatamente o que se quer quando se troca uma palavra-passe.
 *
 * Nao enfraquece nada: quem conseguisse partir a chave por forca bruta
 * partiria a palavra-passe pelo mesmo esforco, e entrava pela porta.
 *
 * Nao ha aqui nada do Prisma nem do React de proposito — isto corre tambem no
 * `proxy.ts`, antes de qualquer pagina existir.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'precificaragao_sessao';

/** Trinta dias. A app usa-se no telemovel dentro do supermercado; pedir a
 *  palavra-passe a cada compra era garantir que alguem a escrevia num papel. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

/** A palavra-passe configurada, ou `null` se ninguem a definiu. */
export function palavraPasse(): string | null {
  const v = process.env.APP_PASSWORD?.trim();
  return v ? v : null;
}

/** Se a aplicacao esta protegida. Falso significa "aberta a quem tenha o link". */
export function protegida(): boolean {
  return palavraPasse() !== null;
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

/** Confere a palavra-passe escrita no formulario. */
export function acertou(tentativa: string): boolean {
  const certa = palavraPasse();
  if (certa === null) return false;
  return iguais(tentativa, certa);
}

/** O valor a guardar no cookie: ate quando vale, e a assinatura disso. */
export function novaSessao(agora = Date.now()): { valor: string; expiraEm: Date } {
  const segredo = palavraPasse();
  if (segredo === null) throw new Error('Sem APP_PASSWORD definida.');

  const expira = agora + DURACAO_MS;
  const dados = String(expira);
  return {
    valor: `${dados}.${assina(dados, segredo)}`,
    expiraEm: new Date(expira),
  };
}

/**
 * Se o cookie e valido: assinado por nos e ainda dentro do prazo.
 *
 * A data vai **dentro** do que e assinado, e nao so na validade do cookie.
 * O prazo do cookie e uma sugestao ao browser; esta e a que conta.
 */
export function sessaoValida(valor: string | undefined, agora = Date.now()): boolean {
  const segredo = palavraPasse();
  if (segredo === null || !valor) return false;

  const corte = valor.lastIndexOf('.');
  if (corte <= 0) return false;

  const dados = valor.slice(0, corte);
  const assinatura = valor.slice(corte + 1);

  if (!iguais(assinatura, assina(dados, segredo))) return false;

  const expira = Number(dados);
  return Number.isFinite(expira) && expira > agora;
}
