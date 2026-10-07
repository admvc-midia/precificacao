/**
 * A base dos testes de integracao: a mesma ligacao do `.env`, noutro schema.
 *
 * Ate 7/10 os testes escreviam na base da casa, com marcas ZZTEMP- e uma rede
 * que provava que nada do utilizador mudava. Funcionava, mas um defeito na
 * limpeza era um defeito nos dados a serio. Agora escrevem em
 * `precificaragao_teste`, que so os testes usam.
 */

export const SCHEMA_DE_TESTES = 'precificaragao_teste';

/** A URL do `.env` com o schema trocado. Recusa-se se nao encontrar o schema da app. */
export function urlDeTestes(url: string): string {
  if (!/[?&]schema=precificaragao(?=&|$)/.test(url)) {
    throw new Error(
      'A DATABASE_URL nao tem `schema=precificaragao`; nao sei derivar a base dos testes dela.',
    );
  }
  return url.replace(/([?&]schema=)precificaragao(?=&|$)/, `$1${SCHEMA_DE_TESTES}`);
}
