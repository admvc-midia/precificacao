/**
 * Formatacao de moeda e percentagem.
 *
 * A moeda e o locale vivem em Settings, entao nada aqui assume EUR: o
 * formatador e construido a partir da configuracao e passado para baixo.
 */

export interface CurrencyConfig {
  currency: string;
  locale: string;
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
    maximumFractionDigits: 5,
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
 * Le um numero digitado pelo usuario aceitando virgula decimal.
 * "12,50" e "12.50" tem de dar o mesmo resultado — em pt-PT escreve-se
 * com virgula, e o `<input type="number">` do browser nem sempre concorda.
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (input === null || input === undefined) return 0;

  const raw = String(input).trim();
  if (!raw) return 0;

  // Primeiro deita fora tudo o que nao e numero, virgula, ponto ou sinal —
  // simbolos de moeda vem em varias formas ("€", "R$", "US$") e nao vale a
  // pena enumera-las. Depois remove o separador de milhar (so e milhar se
  // vier seguido de exatamente tres digitos) e normaliza a virgula decimal.
  const normalized = raw
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** Le uma percentagem digitada como "30" ou "30%" e devolve 0.3. */
export function parsePercent(input: string | number | null | undefined): number {
  const raw = typeof input === 'string' ? input.replace('%', '') : input;
  return parseDecimal(raw) / 100;
}
