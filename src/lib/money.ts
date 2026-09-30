/**
 * Formatacao de moeda e percentagem.
 *
 * A moeda e o locale vivem em Settings, entao nada aqui assume EUR: o
 * formatador e construido a partir da configuracao e passado para baixo.
 */

export interface CurrencyConfig {
  currency: string;
  locale: string;
  /**
   * Casas das quantidades e dos custos por kg/L/un: 2, ou 4 (omissao). Os
   * totais em dinheiro tem sempre 2. So muda o que se le — nunca as contas.
   */
  decimals?: number;
}

/** A configuracao de formatacao a partir da linha de Settings. */
export function currencyOf(s: {
  currency: string;
  locale: string;
  displayDecimals?: number | null;
}): CurrencyConfig {
  return { currency: s.currency, locale: s.locale, decimals: s.displayDecimals ?? 4 };
}

export const DEFAULT_CURRENCY: CurrencyConfig = {
  currency: 'EUR',
  locale: 'pt-PT',
};

export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)', locale: 'pt-PT' },
  { code: 'BRL', label: 'Real (R$)', locale: 'pt-BR' },
  { code: 'USD', label: 'Dolar ($)', locale: 'en-US' },
  { code: 'GBP', label: 'Libra (£)', locale: 'en-GB' },
  { code: 'CHF', label: 'Franco suico (CHF)', locale: 'de-CH' },
] as const;

export function formatMoney(
  value: number,
  cfg: CurrencyConfig = DEFAULT_CURRENCY,
  fractionDigits = 2,
): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Custo unitario (por grama, ml ou unidade) precisa de mais casas decimais:
 * 0,0025 EUR/g viraria "0,00 EUR" com 2 casas.
 */
export function formatUnitCost(value: number, cfg: CurrencyConfig = DEFAULT_CURRENCY): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: cfg.decimals === 2 ? 2 : 5,
  }).format(value);
}

export function formatPercent(
  value: number,
  locale = DEFAULT_CURRENCY.locale,
  digits = 1,
): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(
  value: number,
  locale = DEFAULT_CURRENCY.locale,
  digits = 2,
): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

/**
 * Separa a parte inteira da decimal num numero digitado a mao.
 *
 * ---------------------------------------------------------------------------
 * O PONTO E AMBIGUO E JA CUSTOU CARO
 * ---------------------------------------------------------------------------
 * Em pt-PT o ponto agrupa milhares ("1.234" sao mil duzentos e trinta e
 * quatro) e a virgula separa decimais. Mas o teclado do telemovel poe ponto,
 * e muita gente escreve "0.200" a pensar em dois decimos.
 *
 * A regra antiga era so "ponto seguido de tres digitos e milhar". Por isso
 * `0.200` virava 200 — foi assim que 0,200 kg de fermento entraram na base
 * como 200 kg, e o custo do insumo ficou mil vezes mais barato.
 *
 * A regra nova acrescenta o que torna o caso inequivoco: **um grupo de
 * milhar nunca comeca por zero**. Ninguem escreve "0.200" a pensar em
 * duzentos, nem "0.500" a pensar em quinhentos. Se a parte antes do ponto e
 * zero, o ponto e decimal, ponto final.
 */
function juntaSeparadores(limpo: string, pontoEhSempreDecimal: boolean): string {
  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');

  // Os dois presentes: o ultimo a aparecer e o decimal, o outro e milhar.
  if (temVirgula && temPonto) {
    const decimal = limpo.lastIndexOf(',') > limpo.lastIndexOf('.') ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    return limpo.split(milhar).join('').replace(decimal, '.');
  }

  if (temVirgula) return limpo.replace(',', '.');
  if (!temPonto) return limpo;

  if (pontoEhSempreDecimal) return limpo;

  const partes = limpo.split('.');
  // Mais do que um ponto so pode ser agrupamento: "1.234.567".
  if (partes.length > 2) return partes.join('');

  const [antes, depois] = partes;
  const inteiro = antes.replace('-', '');
  const ehMilhar =
    depois.length === 3 &&
    inteiro.length > 0 &&
    // Um grupo de milhar nunca comeca por zero. "0.200" e 0,2.
    !inteiro.startsWith('0');

  return ehMilhar ? antes + depois : limpo;
}

function leNumero(
  input: string | number | null | undefined,
  pontoEhSempreDecimal: boolean,
): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (input === null || input === undefined) return 0;

  const raw = String(input).trim();
  if (!raw) return 0;

  // Deita fora tudo o que nao e numero, virgula, ponto ou sinal — simbolos de
  // moeda vem em varias formas ("€", "R$", "US$") e nao vale a pena enumera-las.
  const limpo = raw.replace(/[^\d,.\-]/g, '');
  const value = Number(juntaSeparadores(limpo, pontoEhSempreDecimal));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Le um valor em dinheiro digitado pelo usuario.
 * "12,50" e "12.50" tem de dar o mesmo resultado — em pt-PT escreve-se
 * com virgula, e o `<input type="number">` do browser nem sempre concorda.
 */
export function parseDecimal(input: string | number | null | undefined): number {
  return leNumero(input, false);
}

/**
 * Le uma **quantidade** digitada pelo usuario.
 *
 * Aqui o ponto e sempre decimal, nunca agrupamento. Uma quantidade nesta
 * aplicacao escreve-se em kg ou em unidades e anda na casa das unidades ou
 * dos decimos: "1.500" e um quilo e meio, nao mil e quinhentos quilos.
 * Ninguem escreve o tamanho de uma embalagem com separador de milhar.
 *
 * Em dinheiro a leitura contraria e que faz sentido, e por isso sao duas
 * funcoes e nao um argumento que alguem se esqueca de passar.
 */
export function parseQty(input: string | number | null | undefined): number {
  return leNumero(input, true);
}

/** Le uma percentagem digitada como "30" ou "30%" e devolve 0.3. */
export function parsePercent(input: string | number | null | undefined): number {
  const raw = typeof input === 'string' ? input.replace('%', '') : input;
  return parseDecimal(raw) / 100;
}
