/**
 * Conversao de unidades.
 *
 * ---------------------------------------------------------------------------
 * DUAS UNIDADES, E SO UMA E QUE SE VE
 * ---------------------------------------------------------------------------
 * **A unidade base** (`G`, `ML`, `UN`) e onde tudo se calcula e se guarda. E
 * a mais fina das duas de proposito: um insumo a 1,69 EUR/kg custa 0,00169
 * por grama, e guardar o saldo em gramas evita arrastar erros de
 * arredondamento por cada receita que o use.
 *
 * **A unidade de exibicao** (`kg`, `L`, `un`) e a unica que aparece no ecra.
 * Nada se mostra nem se escreve em gramas: 15 g de farofa le-se `0,015 kg` e
 * um custo le-se `1,69 EUR/kg`, nunca `0,00169 EUR/g`. A app mede a peso e a
 * unidade, e mede sempre na mesma escala — um numero que muda de denominador
 * conforme o seu valor (900 g hoje, 1,2 kg amanha) nao se compara de relance,
 * que e precisamente para o que uma lista de custos serve.
 *
 * A conversao entre as duas acontece aqui e em mais lado nenhum.
 */

// Só o tipo: importar a função de formatação traria `money.ts` para dentro do
// motor de custos, que importa este ficheiro. Um `import type` desaparece na
// compilação e não cria essa dependência.
import type { CurrencyConfig } from '@/lib/money';

export type PurchaseUnit = 'KG' | 'G' | 'L' | 'ML' | 'UN';
export type BaseUnit = 'G' | 'ML' | 'UN';

const PURCHASE_TO_BASE: Record<PurchaseUnit, { base: BaseUnit; factor: number }> = {
  KG: { base: 'G', factor: 1000 },
  G: { base: 'G', factor: 1 },
  L: { base: 'ML', factor: 1000 },
  ML: { base: 'ML', factor: 1 },
  UN: { base: 'UN', factor: 1 },
};

export const PURCHASE_UNITS: PurchaseUnit[] = ['KG', 'G', 'L', 'ML', 'UN'];

export const UNIT_LABEL: Record<PurchaseUnit, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'ml',
  UN: 'un',
};

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  G: 'g',
  ML: 'ml',
  UN: 'un',
};

/**
 * A unidade em que se fala com o utilizador, por familia de medida.
 *
 * `G` e `ML` continuam a existir na base de dados e nos ficheiros de
 * fornecedor; o que nao existe e um ecra que os mostre.
 */
export const DISPLAY_UNIT: Record<BaseUnit, PurchaseUnit> = {
  G: 'KG',
  ML: 'L',
  UN: 'UN',
};

export const DISPLAY_UNIT_LABEL: Record<BaseUnit, string> = {
  G: 'kg',
  ML: 'L',
  UN: 'un',
};

/** Unidade base correspondente a uma unidade de compra. */
export function baseUnitOf(unit: PurchaseUnit): BaseUnit {
  return PURCHASE_TO_BASE[unit].base;
}

/** A unidade de exibicao de uma familia, como unidade de compra. */
export function displayUnitOf(base: BaseUnit): PurchaseUnit {
  return DISPLAY_UNIT[base];
}

/** Quantas unidades base cabem numa unidade de exibicao: 1000 no kg, 1 na un. */
export function displayFactor(base: BaseUnit): number {
  return PURCHASE_TO_BASE[DISPLAY_UNIT[base]].factor;
}

/**
 * Converte uma quantidade para a unidade base.
 * @throws se a unidade informada nao pertence a mesma familia da unidade base
 *         do insumo (ex: 200 ml de um insumo vendido em kg).
 */
export function toBase(qty: number, unit: PurchaseUnit, expectedBase?: BaseUnit): number {
  const { base, factor } = PURCHASE_TO_BASE[unit];
  if (expectedBase && base !== expectedBase) {
    throw new UnitMismatchError(unit, expectedBase);
  }
  return qty * factor;
}

/** Converte da unidade base de volta para uma unidade de compra. */
export function fromBase(qtyBase: number, unit: PurchaseUnit): number {
  return qtyBase / PURCHASE_TO_BASE[unit].factor;
}

/** Da unidade base para o numero que se mostra: 1500 g -> 1,5 (kg). */
export function toDisplay(qtyBase: number, base: BaseUnit): number {
  return qtyBase / displayFactor(base);
}

/** Do numero que a pessoa escreveu para a unidade base: 1,5 (kg) -> 1500 g. */
export function fromDisplay(qty: number, base: BaseUnit): number {
  return qty * displayFactor(base);
}

/** Casas decimais suficientes para 0,5 g nao virar zero nem 1 g. */
const MAX_DECIMAIS = 4;

/**
 * Formata uma quantidade guardada em unidade base, sempre na de exibicao:
 * 1500 g -> "1,5 kg"; 15 g -> "0,015 kg"; 3 un -> "3 un".
 */
export function formatBaseQty(qtyBase: number, base: BaseUnit, locale = 'pt-PT'): string {
  const casas = base === 'UN' ? 2 : MAX_DECIMAIS;
  const valor = new Intl.NumberFormat(locale, { maximumFractionDigits: casas }).format(
    toDisplay(qtyBase, base),
  );
  return `${valor} ${DISPLAY_UNIT_LABEL[base]}`;
}

/**
 * Formata um numero para dentro de um campo de texto, sem separador de
 * milhares — `Intl` poria um ponto que depois nao se consegue reenviar.
 */
export function displayQtyValue(qtyBase: number, base: BaseUnit): string {
  const v = toDisplay(qtyBase, base);
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toFixed(base === 'UN' ? 2 : MAX_DECIMAIS)));
}

/**
 * Formata um custo guardado por unidade base, sempre por unidade de exibicao:
 * 0,00169 por grama -> "1,69 EUR/kg".
 *
 * Nunca escala conforme o valor. Uma lista de custos existe para se comparar
 * de relance, e dois numeros com denominadores diferentes nao se comparam.
 */
export function formatCostPerUnit(
  costPerBase: number,
  base: BaseUnit,
  cfg: CurrencyConfig,
): string {
  if (!Number.isFinite(costPerBase)) return '—';
  const valor = new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.currency,
    minimumFractionDigits: 2,
    // Um guardanapo a 0,015 por unidade ainda precisa de casas; um kg de
    // acucar a 1,69 nao precisa de nenhuma a mais.
    maximumFractionDigits: 4,
  }).format(costPerBase * displayFactor(base));
  return `${valor}/${DISPLAY_UNIT_LABEL[base]}`;
}

export class UnitMismatchError extends Error {
  constructor(
    readonly given: PurchaseUnit,
    readonly expectedBase: BaseUnit,
  ) {
    super(
      `Unidade incompativel: "${UNIT_LABEL[given]}" nao pode ser usada num insumo medido em "${BASE_UNIT_LABEL[expectedBase]}".`,
    );
    this.name = 'UnitMismatchError';
  }
}
