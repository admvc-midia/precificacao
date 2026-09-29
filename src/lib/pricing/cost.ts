/**
 * Custo de insumos e fichas tecnicas (Modulos 1 e 2).
 *
 * Funcoes puras. Nenhum acesso a banco, nenhuma dependencia de React.
 */

import { baseUnitOf, toBase, UnitMismatchError, type BaseUnit } from '@/lib/units';
import type {
  CostContext,
  CostLine,
  IngredientCategory,
  IngredientInput,
  RecipeCost,
  RecipeInput,
} from './types';

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/** Ciclo na arvore de sub-receitas: A usa B, B usa A. */
export class RecipeCycleError extends PricingError {
  constructor(readonly path: string[]) {
    super(`Ciclo de sub-receitas detetado: ${path.join(' -> ')}`);
    this.name = 'RecipeCycleError';
  }
}

/**
 * Custo de uma unidade base do insumo, **sem** fator de correcao.
 * Ex: pacote de 5 kg por 12,50 EUR -> 0,0025 EUR/g.
 */
export function costPerBaseUnit(ing: IngredientInput): number {
  const qtyBase = toBase(ing.purchaseQty, ing.purchaseUnit);
  if (qtyBase <= 0) {
    throw new PricingError(
      `Insumo "${ing.name}": a quantidade de compra tem de ser maior que zero.`,
    );
  }
  return ing.purchasePrice / qtyBase;
}

/**
 * Custo de uma unidade base **aproveitavel**, ja com o fator de correcao.
 *
 * O FC = peso bruto / peso liquido. Se 1 kg de alcatra rende 800 g limpos,
 * FC = 1,25 e cada grama utilizada custa 25% a mais do que o preco de compra
 * sugere — porque foi preciso comprar 1,25 g para ter 1 g no prato.
 */
export function effectiveCostPerBaseUnit(ing: IngredientInput): number {
  const fc = normalizeCorrectionFactor(ing);
  return costPerBaseUnit(ing) * fc;
}

function normalizeCorrectionFactor(ing: IngredientInput): number {
  const fc = ing.correctionFactor;
  if (!Number.isFinite(fc) || fc <= 0) {
    throw new PricingError(
      `Insumo "${ing.name}": fator de correcao invalido (${fc}). Tem de ser > 0.`,
    );
  }
  return fc;
}

/** FC a partir dos pesos bruto e liquido, como o usuario mede na cozinha. */
export function correctionFactorFromWeights(gross: number, net: number): number {
  if (net <= 0) throw new PricingError('O peso liquido tem de ser maior que zero.');
  if (gross < net) {
    throw new PricingError('O peso bruto nao pode ser menor que o peso liquido.');
  }
  return gross / net;
}

/** Percentual de perda correspondente a um FC. FC 1,25 -> 20% de perda. */
export function wastePercentFromFc(fc: number): number {
  if (fc <= 0) return 0;
  return 1 - 1 / fc;
}

/** FC correspondente a um percentual de perda. 20% -> FC 1,25. */
export function fcFromWastePercent(waste: number): number {
  if (waste < 0 || waste >= 1) {
    throw new PricingError('A perda tem de estar entre 0% e 100% (exclusive).');
  }
  return 1 / (1 - waste);
}

/**
 * Resolve o custo completo de uma ficha tecnica, descendo recursivamente
 * pelas sub-receitas.
 *
 * @param recipeId  receita a calcular
 * @param ctx       insumos e receitas carregados em memoria
 * @param memo      cache entre chamadas (opcional; reaproveitado internamente)
 */
export function computeRecipeCost(
  recipeId: string,
  ctx: CostContext,
  memo: Map<string, RecipeCost> = new Map(),
): RecipeCost {
  return resolve(recipeId, ctx, memo, []);
}

function resolve(
  recipeId: string,
  ctx: CostContext,
  memo: Map<string, RecipeCost>,
  stack: string[],
): RecipeCost {
  const cached = memo.get(recipeId);
  if (cached) return cached;

  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) throw new PricingError(`Ficha tecnica nao encontrada: ${recipeId}`);

  if (stack.includes(recipeId)) {
    const names = [...stack, recipeId].map((id) => ctx.recipes.get(id)?.name ?? id);
    throw new RecipeCycleError(names);
  }
  if (recipe.yieldQty <= 0) {
    throw new PricingError(
      `Ficha "${recipe.name}": o rendimento tem de ser maior que zero.`,
    );
  }

  const nextStack = [...stack, recipeId];
  const lines: CostLine[] = recipe.items.map((item) =>
    item.kind === 'INGREDIENT'
      ? ingredientLine(item.ingredientId, item.qty, item.unit, ctx, recipe)
      : recipeLine(item.childRecipeId, item.qty, item.unit, ctx, memo, nextStack, recipe),
  );

  const batchFoodCost = sum(lines.map((l) => l.cost));
  const foodCostPerUnit = batchFoodCost / recipe.yieldQty;

  const packagingCost = packagingUnitCost(recipe.packagingId, ctx, recipe.name);
  const deliveryPackagingCost = packagingUnitCost(
    recipe.deliveryPackagingId,
    ctx,
    recipe.name,
  );

  const result: RecipeCost = {
    recipeId,
    name: recipe.name,
    kind: recipe.kind,
    yieldQty: recipe.yieldQty,
    yieldUnit: recipe.yieldUnit,
    lines,
    batchFoodCost,
    foodCostPerUnit,
    packagingCost,
    deliveryPackagingCost,
    productCost: foodCostPerUnit + packagingCost,
  };

  memo.set(recipeId, result);
  return result;
}

function ingredientLine(
  ingredientId: string,
  qty: number,
  unit: CostLine['unit'],
  ctx: CostContext,
  recipe: RecipeInput,
): CostLine {
  const ing = ctx.ingredients.get(ingredientId);
  if (!ing) {
    throw new PricingError(
      `Ficha "${recipe.name}": insumo nao encontrado (${ingredientId}).`,
    );
  }

  const expectedBase = baseUnitOf(ing.purchaseUnit);
  let qtyBase: number;
  try {
    qtyBase = toBase(qty, unit, expectedBase);
  } catch (err) {
    if (err instanceof UnitMismatchError) {
      throw new PricingError(
        `Ficha "${recipe.name}", insumo "${ing.name}": ${err.message}`,
      );
    }
    throw err;
  }

  const fc = normalizeCorrectionFactor(ing);
  const unitCost = effectiveCostPerBaseUnit(ing);

  return {
    kind: 'INGREDIENT',
    refId: ing.id,
    name: ing.name,
    qty,
    unit,
    qtyBase,
    correctionFactor: fc,
    qtyBaseWithFc: qtyBase * fc,
    unitCost,
    cost: qtyBase * unitCost,
  };
}

function recipeLine(
  childId: string,
  qty: number,
  unit: CostLine['unit'],
  ctx: CostContext,
  memo: Map<string, RecipeCost>,
  stack: string[],
  parent: RecipeInput,
): CostLine {
  const child = ctx.recipes.get(childId);
  if (!child) {
    throw new PricingError(
      `Ficha "${parent.name}": sub-receita nao encontrada (${childId}).`,
    );
  }

  const childCost = resolve(childId, ctx, memo, stack);

  let qtyBase: number;
  try {
    qtyBase = toBase(qty, unit, child.yieldUnit);
  } catch (err) {
    if (err instanceof UnitMismatchError) {
      throw new PricingError(
        `Ficha "${parent.name}", sub-receita "${child.name}": ${err.message}`,
      );
    }
    throw err;
  }

  // O custo por unidade da base ja carrega o FC dos insumos dela, e a perda
  // de processo ja esta no rendimento declarado do lote. Por isso FC = 1 aqui.
  const unitCost = childCost.batchFoodCost / child.yieldQty;

  return {
    kind: 'RECIPE',
    refId: childId,
    name: child.name,
    qty,
    unit,
    qtyBase,
    correctionFactor: 1,
    qtyBaseWithFc: qtyBase,
    unitCost,
    cost: qtyBase * unitCost,
  };
}

function packagingUnitCost(
  id: string | null | undefined,
  ctx: CostContext,
  recipeName: string,
): number {
  if (!id) return 0;
  const pack = ctx.ingredients.get(id);
  if (!pack) {
    throw new PricingError(
      `Ficha "${recipeName}": embalagem nao encontrada (${id}).`,
    );
  }
  // Embalagem e sempre 1 unidade por porcao.
  return effectiveCostPerBaseUnit(pack);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Explosao de insumos (Modulo 4): quanto de cada insumo *basico* uma
 * quantidade de porcoes consome, descendo por todas as sub-receitas.
 *
 * Retorna quantidades na unidade base **ja com o fator de correcao**, que e o
 * que de facto precisa ser comprado.
 */
export function explodeIngredients(
  demand: Array<{ recipeId: string; qty: number }>,
  ctx: CostContext,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const { recipeId, qty } of demand) {
    for (const line of flattenRecipe(recipeId, qty, ctx)) {
      totals.set(
        line.ingredientId,
        (totals.get(line.ingredientId) ?? 0) + line.qtyBaseWithFc,
      );
    }
  }
  return totals;
}

/**
 * Uma linha da composicao ja achatada ate ao insumo basico.
 *
 * Separa duas quantidades que a aplicacao costumava confundir: o que vai no
 * prato e o que e preciso comprar. Num insumo com fator de correcao elas
 * nunca sao iguais, e e a segunda que se leva ao supermercado.
 */
export interface FlatLine {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  category: IngredientCategory;
  /**
   * Por onde se chegou a este insumo. Vazio quando entra direto na ficha;
   * ["Maionese da casa"] quando vem de uma sub-receita.
   */
  via: string[];
  /** O que vai no prato, na unidade base. Sem fator de correcao. */
  qtyBase: number;
  correctionFactor: number;
  /** O que e preciso comprar, na unidade base. Ja com o fator de correcao. */
  qtyBaseWithFc: number;
  /** Custo por unidade base, ja com o fator de correcao. */
  unitCost: number;
  cost: number;
}

/**
 * Desce a ficha ate aos insumos basicos, resolvendo as sub-receitas.
 *
 * O mesmo insumo alcancado por caminhos diferentes — sal na maionese e sal
 * direto na ficha — junta-se numa linha so, porque a pergunta e "quanto sal
 * gasto", e os caminhos ficam listados em `via`.
 *
 * @param portions quantas porcoes do produto (ou quantas unidades base, se
 *                 for uma preparacao base)
 */
export function flattenRecipe(
  recipeId: string,
  portions: number,
  ctx: CostContext,
): FlatLine[] {
  const acc = new Map<string, FlatLine>();
  walk(recipeId, portions, ctx, acc, [], []);

  return [...acc.values()].sort(
    (a, b) => b.cost - a.cost || a.name.localeCompare(b.name),
  );
}

function addTo(
  acc: Map<string, FlatLine>,
  ing: IngredientInput,
  qtyBase: number,
  via: string[],
): void {
  const fc = normalizeCorrectionFactor(ing);
  const unitCost = effectiveCostPerBaseUnit(ing);
  const existing = acc.get(ing.id);

  if (existing) {
    existing.qtyBase += qtyBase;
    existing.qtyBaseWithFc += qtyBase * fc;
    existing.cost += qtyBase * unitCost;
    for (const v of via) if (!existing.via.includes(v)) existing.via.push(v);
    return;
  }

  acc.set(ing.id, {
    ingredientId: ing.id,
    name: ing.name,
    baseUnit: baseUnitOf(ing.purchaseUnit),
    category: ing.category,
    via: [...via],
    qtyBase,
    correctionFactor: fc,
    qtyBaseWithFc: qtyBase * fc,
    unitCost,
    cost: qtyBase * unitCost,
  });
}

function walk(
  recipeId: string,
  portions: number,
  ctx: CostContext,
  acc: Map<string, FlatLine>,
  via: string[],
  stack: string[],
): void {
  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) throw new PricingError(`Ficha tecnica nao encontrada: ${recipeId}`);
  if (stack.includes(recipeId)) {
    const names = [...stack, recipeId].map((id) => ctx.recipes.get(id)?.name ?? id);
    throw new RecipeCycleError(names);
  }
  if (recipe.yieldQty <= 0) {
    throw new PricingError(
      `Ficha "${recipe.name}": o rendimento tem de ser maior que zero.`,
    );
  }

  // Quantos lotes desta receita as porcoes pedidas representam.
  const batches = portions / recipe.yieldQty;
  const nextStack = [...stack, recipeId];

  for (const item of recipe.items) {
    if (item.kind === 'INGREDIENT') {
      const ing = ctx.ingredients.get(item.ingredientId);
      if (!ing) {
        throw new PricingError(
          `Ficha "${recipe.name}": insumo nao encontrado (${item.ingredientId}).`,
        );
      }
      const qtyBase = toBase(item.qty, item.unit, baseUnitOf(ing.purchaseUnit));
      addTo(acc, ing, qtyBase * batches, via);
    } else {
      const child = ctx.recipes.get(item.childRecipeId);
      if (!child) {
        throw new PricingError(
          `Ficha "${recipe.name}": sub-receita nao encontrada (${item.childRecipeId}).`,
        );
      }
      const qtyBase = toBase(item.qty, item.unit, child.yieldUnit);
      walk(item.childRecipeId, qtyBase * batches, ctx, acc, [...via, child.name], nextStack);
    }
  }

  // Embalagens: uma por porcao produzida, mais a perda por quebra.
  //
  // O fator de correcao tem de ser aplicado aqui tambem. O custo da ficha ja
  // o aplicava (ver `packagingUnitCost`), entao sem isto a lista de compras
  // mandava comprar menos embalagens do que o custo dizia gastar — e as duas
  // contas discordavam em silencio.
  for (const packId of [recipe.packagingId, recipe.deliveryPackagingId]) {
    if (!packId) continue;
    const pack = ctx.ingredients.get(packId);
    if (!pack) {
      throw new PricingError(
        `Ficha "${recipe.name}": embalagem nao encontrada (${packId}).`,
      );
    }
    // A embalagem conta-se por porcao, nao por lote: `portions` ja e o que
    // se quer, sem passar pelos `batches`.
    addTo(acc, pack, portions, via);
  }
}
