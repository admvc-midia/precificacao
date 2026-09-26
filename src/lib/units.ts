/**
 * Conversao de unidades.
 *
 * Toda a aplicacao calcula na "unidade base" do insumo: G para solidos,
 * ML para liquidos, UN para itens contaveis. O usuario compra em KG/L/UN e
 * escreve a ficha tecnica em g/ml/un — a conversao acontece aqui e em
 * nenhum outro lugar.
 */

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

/** Unidade base correspondente a uma unidade de compra. */
export function baseUnitOf(unit: PurchaseUnit): BaseUnit {
  return PURCHASE_TO_BASE[unit].base;
}

/** Unidades de compra que sao compativeis com uma unidade base. */
export function compatibleUnits(base: BaseUnit): PurchaseUnit[] {
  return PURCHASE_UNITS.filter((u) => baseUnitOf(u) === base);
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

/**
 * Formata uma quantidade na unidade base escolhendo a escala legivel:
 * 1500 g -> "1,5 kg"; 250 g -> "250 g".
 */
export function formatBaseQty(qtyBase: number, base: BaseUnit, locale = 'pt-PT'): string {
  const nf = (v: number, max = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(v);

  if (base === 'UN') return `${nf(qtyBase, 2)} un`;
  if (Math.abs(qtyBase) >= 1000) {
    return `${nf(qtyBase / 1000, 3)} ${base === 'G' ? 'kg' : 'L'}`;
  }
  return `${nf(qtyBase, 2)} ${base === 'G' ? 'g' : 'ml'}`;
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
