/**
 * Fronteira entre o Prisma e o motor de calculo.
 *
 * O banco guarda dinheiro em Decimal(12,4) — preciso, mas o Decimal do Prisma
 * nao atravessa a fronteira servidor/cliente do Next.js e nao entra nas
 * funcoes puras de precificacao, que trabalham com `number`. A conversao
 * acontece toda aqui, num lugar so.
 */

import type {
  Ingredient as PrismaIngredient,
  Recipe as PrismaRecipe,
  RecipeItem as PrismaRecipeItem,
  SalesChannel as PrismaChannel,
  Settings as PrismaSettings,
  Supplier as PrismaSupplier,
} from '@prisma/client';

import type { GlobalSettings } from '@/lib/pricing/channels';
import type {
  ChannelInput,
  CostContext,
  IngredientInput,
  RecipeInput,
} from '@/lib/pricing/types';
import { baseUnitOf, displayQtyValue } from '@/lib/units';

/** Decimal do Prisma (ou qualquer coisa numerica) para `number`. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

/** Como `num`, mas preserva o null (campos opcionais). */
export function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

type IngredientRow = PrismaIngredient & { supplier?: PrismaSupplier | null };

export function toIngredientInput(row: IngredientRow): IngredientInput {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    purchasePrice: num(row.purchasePrice),
    purchaseQty: num(row.purchaseQty),
    purchaseUnit: row.purchaseUnit,
    correctionFactor: num(row.correctionFactor),
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    stockBase: num(row.stockBase),
  };
}

type RecipeRow = PrismaRecipe & { items: PrismaRecipeItem[] };

export function toRecipeInput(row: RecipeRow): RecipeInput {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    yieldQty: num(row.yieldQty),
    yieldUnit: row.yieldUnit,
    packagingId: row.packagingId,
    deliveryPackagingId: row.deliveryPackagingId,
    items: [...row.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) =>
        item.childRecipeId
          ? {
              kind: 'RECIPE' as const,
              childRecipeId: item.childRecipeId,
              qty: num(item.qty),
              unit: item.unit,
            }
          : {
              kind: 'INGREDIENT' as const,
              ingredientId: item.ingredientId!,
              qty: num(item.qty),
              unit: item.unit,
            },
      ),
  };
}

/**
 * Linha do banco para os valores do formulario de insumo.
 *
 * Tudo em texto e tudo simples: o formulario e um componente de cliente, e
 * `Decimal` do Prisma nao atravessa essa fronteira.
 */
export function toIngredientFormValues(row: IngredientRow) {
  const dec = (v: unknown) => {
    const n = num(v);
    return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '';
  };

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    supplierId: row.supplierId ?? '',
    purchasePrice: dec(row.purchasePrice),
    purchaseQty: dec(row.purchaseQty),
    purchaseUnit: row.purchaseUnit,
    correctionFactor: dec(row.correctionFactor),
    // O formulario mostra kg; a coluna guarda gramas.
    stockBase: displayQtyValue(num(row.stockBase), row.baseUnit),
    allergens: row.allergens ?? [],
    allergensReviewed: row.allergensReviewed ?? false,
    // Nulo e campo vazio: "nao avisar". Nao e zero.
    minStockBase:
      row.minStockBase === null || row.minStockBase === undefined
        ? ''
        : displayQtyValue(num(row.minStockBase), row.baseUnit),
    notes: row.notes ?? '',
  };
}

export function toChannelInput(row: PrismaChannel): ChannelInput {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    commissionRate: num(row.commissionRate),
    deliveryCost: num(row.deliveryCost),
    cardFeeRate: numOrNull(row.cardFeeRate),
    usesDeliveryPackaging: row.usesDeliveryPackaging,
  };
}

export function toGlobalSettings(row: PrismaSettings): GlobalSettings {
  return {
    vatRate: num(row.vatRate),
    vatMode: row.vatMode,
    fixedCostRate: num(row.fixedCostRate),
    cardFeeRate: num(row.cardFeeRate),
    targetCmv: num(row.targetCmv),
    targetMargin: num(row.targetMargin),
    rounding: row.rounding,
  };
}

/** Monta o contexto de calculo a partir das linhas cruas do banco. */
export function buildCostContext(
  ingredients: IngredientRow[],
  recipes: RecipeRow[],
): CostContext {
  return {
    ingredients: new Map(ingredients.map((i) => [i.id, toIngredientInput(i)])),
    recipes: new Map(recipes.map((r) => [r.id, toRecipeInput(r)])),
  };
}

/**
 * Unidade base derivada da unidade de compra. Persistida junto do insumo
 * para permitir filtrar por familia sem recalcular.
 */
export { baseUnitOf };
