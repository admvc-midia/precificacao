/**
 * Tipos do motor de precificacao.
 *
 * Nada aqui depende de React, Prisma ou do banco: sao estruturas de dados
 * puras, para que as formulas possam ser testadas isoladamente e reutilizadas
 * no cliente (simuladores ao vivo) e no servidor (relatorios).
 */

import type { BaseUnit, PurchaseUnit } from '@/lib/units';

export type VatMode = 'INCLUDED' | 'ADDED';
export type RecipeKind = 'BASE' | 'PRODUCT';
export type IngredientCategory = 'FOOD' | 'PACKAGING';
export type ChannelKind = 'COUNTER' | 'OWN_DELIVERY' | 'PLATFORM';
export type PricingMode = 'TARGET_CMV' | 'TARGET_MARGIN' | 'MANUAL';
export type RoundingStrategy =
  | 'NONE'
  | 'NEAREST_05'
  | 'NEAREST_10'
  | 'ENDING_90'
  | 'ENDING_95';

// ---------------------------------------------------------------------------
// Entradas de custo
// ---------------------------------------------------------------------------

export interface IngredientInput {
  id: string;
  name: string;
  category: IngredientCategory;
  /** Preco pago pela embalagem de compra inteira. */
  purchasePrice: number;
  /** Tamanho da embalagem de compra, em `purchaseUnit`. */
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  /** Peso bruto / peso liquido. 1 = sem perda. */
  correctionFactor: number;
  supplierId?: string | null;
  supplierName?: string | null;
  /** Estoque disponivel na unidade base (Modulo 4). */
  stockBase?: number;
}

export type RecipeItemInput =
  | { kind: 'INGREDIENT'; ingredientId: string; qty: number; unit: PurchaseUnit }
  | { kind: 'RECIPE'; childRecipeId: string; qty: number; unit: PurchaseUnit };

export interface RecipeInput {
  id: string;
  name: string;
  kind: RecipeKind;
  /** PRODUCT: porcoes por lote. BASE: rendimento do lote em G/ML. */
  yieldQty: number;
  yieldUnit: BaseUnit;
  items: RecipeItemInput[];
  packagingId?: string | null;
  deliveryPackagingId?: string | null;
}

/** Tabelas em memoria usadas na resolucao recursiva de sub-receitas. */
export interface CostContext {
  ingredients: Map<string, IngredientInput>;
  recipes: Map<string, RecipeInput>;
}

// ---------------------------------------------------------------------------
// Saidas de custo
// ---------------------------------------------------------------------------

export interface CostLine {
  kind: 'INGREDIENT' | 'RECIPE';
  refId: string;
  name: string;
  /** Quantidade pedida na ficha, como escrita pelo usuario. */
  qty: number;
  unit: PurchaseUnit;
  /** Quantidade na unidade base, antes do fator de correcao. */
  qtyBase: number;
  /** Fator de correcao aplicado (1 para sub-receitas). */
  correctionFactor: number;
  /** Quantidade que realmente precisa sair do estoque. */
  qtyBaseWithFc: number;
  /** Custo por unidade base ja com o fator de correcao embutido. */
  unitCost: number;
  /** Custo desta linha no lote inteiro. */
  cost: number;
}

export interface RecipeCost {
  recipeId: string;
  name: string;
  kind: RecipeKind;
  yieldQty: number;
  yieldUnit: BaseUnit;
  lines: CostLine[];
  /** Custo dos insumos + sub-receitas do lote inteiro. */
  batchFoodCost: number;
  /** Custo de alimento por porcao (ou por grama, se BASE). */
  foodCostPerUnit: number;
  /** Embalagem principal, por porcao. */
  packagingCost: number;
  /** Embalagem extra de transporte, por porcao. */
  deliveryPackagingCost: number;
  /**
   * Custo do produto por porcao no balcao: alimento + embalagem principal.
   * A embalagem de transporte entra apenas nos canais que a usam.
   */
  productCost: number;
}

// ---------------------------------------------------------------------------
// Precificacao
// ---------------------------------------------------------------------------

/** Os custos em moeda que entram no preco de uma porcao. */
export interface BreakdownCosts {
  /** Custo dos insumos por porcao. */
  foodCost: number;
  /** Embalagens por porcao: principal + transporte, se o canal a usar. */
  packagingCost: number;
}

export interface PricingParams {
  /** IVA/imposto como fracao. 0.13 = 13%. */
  vatRate: number;
  vatMode: VatMode;
  /** Custos fixos como fracao da receita liquida. */
  fixedCostRate: number;
  /** Taxa de cartao como fracao do valor bruto pago pelo cliente. */
  cardFeeRate: number;
  /** Comissao da plataforma como fracao do valor bruto. */
  platformFeeRate: number;
  /** Custo fixo de entrega por pedido, em moeda. */
  deliveryCost: number;
}

export const DEFAULT_PARAMS: PricingParams = {
  vatRate: 0.13,
  vatMode: 'INCLUDED',
  fixedCostRate: 0.22,
  cardFeeRate: 0.012,
  platformFeeRate: 0,
  deliveryCost: 0,
};

/**
 * Autopsia de um preco: para onde vai cada centimo.
 * Vale a identidade: `net = fixedCost + cardFee + platformFee + productCost +
 * deliveryCost + profit` (todos os campos ja em moeda).
 */
export interface PriceBreakdown {
  /** Preco de menu, na convencao de `vatMode`. */
  price: number;
  /** O que o cliente realmente paga, sempre com IVA. */
  gross: number;
  /** Receita liquida, sem IVA. Base de todos os percentuais de gestao. */
  net: number;
  vatAmount: number;

  foodCost: number;
  packagingCost: number;
  /** foodCost + packagingCost. */
  productCost: number;
  deliveryCost: number;

  fixedCost: number;
  cardFee: number;
  platformFee: number;

  /** Sobra depois de tudo. Pode ser negativo. */
  profit: number;

  /** productCost / net. O CMV do produto. */
  cmv: number;
  /** profit / net. */
  netMargin: number;
  /** price / productCost. */
  markup: number;
  /** price - (custos variaveis diretos). Usado em engenharia de cardapio. */
  contributionMargin: number;
}

export interface PriceResult extends PriceBreakdown {
  /** Preco antes do arredondamento psicologico. */
  rawPrice: number;
  /** Nao ha preco possivel com estas taxas (denominador <= 0). */
  feasible: boolean;
  /** Explicacao legivel quando `feasible` e falso ou algo merece atencao. */
  warnings: string[];
}

export interface ChannelInput {
  id: string;
  name: string;
  kind: ChannelKind;
  commissionRate: number;
  deliveryCost: number;
  /** Sobrescreve a taxa de cartao global. */
  cardFeeRate?: number | null;
  usesDeliveryPackaging: boolean;
}
