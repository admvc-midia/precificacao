import { describe, expect, it } from 'vitest';

import {
  computeRecipeCost,
  correctionFactorFromWeights,
  costPerBaseUnit,
  effectiveCostPerBaseUnit,
  explodeIngredients,
  fcFromWastePercent,
  PricingError,
  RecipeCycleError,
  wastePercentFromFc,
} from '@/lib/pricing/cost';
import type { CostContext, IngredientInput, RecipeInput } from '@/lib/pricing/types';
import { toBase, UnitMismatchError } from '@/lib/units';

// ---------------------------------------------------------------------------
// Cenario partilhado: a mesma lanchonete do seed e de tools/verify_pricing.py
// ---------------------------------------------------------------------------

function ingredient(
  id: string,
  purchasePrice: number,
  purchaseQty: number,
  purchaseUnit: IngredientInput['purchaseUnit'],
  correctionFactor = 1,
  category: IngredientInput['category'] = 'FOOD',
): IngredientInput {
  return {
    id,
    name: id,
    category,
    purchasePrice,
    purchaseQty,
    purchaseUnit,
    correctionFactor,
  };
}

function buildCtx(): CostContext {
  const ingredients = new Map<string, IngredientInput>(
    (
      [
        ingredient('carne', 12.5, 5, 'KG'),
        ingredient('alcatra', 18, 1, 'KG', 1.25),
        ingredient('pao', 3.6, 24, 'UN'),
        ingredient('queijo', 6.9, 1, 'KG'),
        ingredient('ovo', 2.4, 12, 'UN'),
        ingredient('oleo', 2, 1, 'L'),
        ingredient('caixa', 0.12, 1, 'UN', 1, 'PACKAGING'),
        ingredient('saco', 0.08, 1, 'UN', 1, 'PACKAGING'),
      ] as IngredientInput[]
    ).map((i) => [i.id, i]),
  );

  const recipes = new Map<string, RecipeInput>(
    (
      [
        {
          id: 'maionese',
          name: 'Maionese da casa',
          kind: 'BASE',
          yieldQty: 1200,
          yieldUnit: 'ML',
          items: [
            { kind: 'INGREDIENT', ingredientId: 'ovo', qty: 4, unit: 'UN' },
            { kind: 'INGREDIENT', ingredientId: 'oleo', qty: 1, unit: 'L' },
          ],
        },
        {
          id: 'burger',
          name: 'Hamburguer da Casa',
          kind: 'PRODUCT',
          yieldQty: 1,
          yieldUnit: 'UN',
          packagingId: 'caixa',
          deliveryPackagingId: 'saco',
          items: [
            { kind: 'INGREDIENT', ingredientId: 'carne', qty: 160, unit: 'G' },
            { kind: 'INGREDIENT', ingredientId: 'pao', qty: 1, unit: 'UN' },
            { kind: 'INGREDIENT', ingredientId: 'queijo', qty: 40, unit: 'G' },
            { kind: 'RECIPE', childRecipeId: 'maionese', qty: 30, unit: 'ML' },
          ],
        },
      ] as RecipeInput[]
    ).map((r) => [r.id, r]),
  );

  return { ingredients, recipes };
}

// ---------------------------------------------------------------------------

describe('custo por unidade base', () => {
  it('converte o pacote de compra para a unidade base', () => {
    // 12,50 EUR por 5 kg = 12,50 / 5000 g
    expect(costPerBaseUnit(ingredient('x', 12.5, 5, 'KG'))).toBeCloseTo(0.0025, 10);
    expect(costPerBaseUnit(ingredient('x', 2, 1, 'L'))).toBeCloseTo(0.002, 10);
    expect(costPerBaseUnit(ingredient('x', 3.6, 24, 'UN'))).toBeCloseTo(0.15, 10);
  });

  it('recusa quantidade de compra nao positiva', () => {
    expect(() => costPerBaseUnit(ingredient('x', 10, 0, 'KG'))).toThrow(PricingError);
  });

  it('recusa fator de correcao invalido', () => {
    expect(() => effectiveCostPerBaseUnit(ingredient('x', 10, 1, 'KG', 0))).toThrow(
      PricingError,
    );
  });
});

describe('fator de correcao', () => {
  it('encarece a unidade aproveitavel na proporcao da perda', () => {
    // 18 EUR/kg com FC 1,25 -> cada grama util custa como 1,25 g compradas.
    expect(effectiveCostPerBaseUnit(ingredient('x', 18, 1, 'KG', 1.25))).toBeCloseTo(
      0.0225,
      10,
    );
  });

  it('e equivalente a comprar o bruto e usar o liquido', () => {
    // 1 kg bruto que rende 800 g limpos: 18,00 / 800 g.
    const fc = correctionFactorFromWeights(1000, 800);
    expect(fc).toBeCloseTo(1.25, 10);
    expect(effectiveCostPerBaseUnit(ingredient('x', 18, 1, 'KG', fc))).toBeCloseTo(
      18 / 800,
      10,
    );
  });

  it('converte entre FC e percentagem de perda nos dois sentidos', () => {
    expect(wastePercentFromFc(1.25)).toBeCloseTo(0.2, 10);
    expect(fcFromWastePercent(0.2)).toBeCloseTo(1.25, 10);
    expect(fcFromWastePercent(wastePercentFromFc(1.6667))).toBeCloseTo(1.6667, 6);
  });

  it('recusa peso liquido maior que o bruto', () => {
    expect(() => correctionFactorFromWeights(800, 1000)).toThrow(PricingError);
    expect(() => correctionFactorFromWeights(1000, 0)).toThrow(PricingError);
  });
});

describe('ficha tecnica', () => {
  it('soma insumos e sub-receitas do lote', () => {
    const cost = computeRecipeCost('burger', buildCtx());

    const esperado =
      160 * 0.0025 + // carne
      1 * (3.6 / 24) + // pao
      40 * (6.9 / 1000) + // queijo
      30 * (2.8 / 1200); // maionese (lote de 2,80 EUR / 1200 ml)

    expect(cost.foodCostPerUnit).toBeCloseTo(esperado, 10);
  });

  it('resolve o custo da sub-receita pelo rendimento do lote dela', () => {
    const cost = computeRecipeCost('maionese', buildCtx());
    // 4 ovos a 0,20 + 1 L de oleo a 2,00 = 2,80 por 1200 ml
    expect(cost.batchFoodCost).toBeCloseTo(2.8, 10);
    expect(cost.foodCostPerUnit).toBeCloseTo(2.8 / 1200, 10);
  });

  it('deixa a embalagem de transporte fora do custo primo de balcao', () => {
    const cost = computeRecipeCost('burger', buildCtx());
    expect(cost.packagingCost).toBeCloseTo(0.12, 10);
    expect(cost.deliveryPackagingCost).toBeCloseTo(0.08, 10);
    expect(cost.primeCost).toBeCloseTo(cost.foodCostPerUnit + 0.12, 10);
  });

  it('divide o custo do lote pelo rendimento', () => {
    const ctx = buildCtx();
    const single = computeRecipeCost('burger', ctx);

    const ctx2 = buildCtx();
    ctx2.recipes.get('burger')!.yieldQty = 2;
    const double = computeRecipeCost('burger', ctx2);

    expect(double.foodCostPerUnit).toBeCloseTo(single.foodCostPerUnit / 2, 10);
  });

  it('recusa rendimento nao positivo', () => {
    const ctx = buildCtx();
    ctx.recipes.get('burger')!.yieldQty = 0;
    expect(() => computeRecipeCost('burger', ctx)).toThrow(PricingError);
  });

  it('deteta ciclo de sub-receitas em vez de entrar em recursao infinita', () => {
    const ctx = buildCtx();
    ctx.recipes.set('a', {
      id: 'a',
      name: 'A',
      kind: 'BASE',
      yieldQty: 100,
      yieldUnit: 'G',
      items: [{ kind: 'RECIPE', childRecipeId: 'b', qty: 10, unit: 'G' }],
    });
    ctx.recipes.set('b', {
      id: 'b',
      name: 'B',
      kind: 'BASE',
      yieldQty: 100,
      yieldUnit: 'G',
      items: [{ kind: 'RECIPE', childRecipeId: 'a', qty: 10, unit: 'G' }],
    });

    expect(() => computeRecipeCost('a', ctx)).toThrow(RecipeCycleError);
  });

  it('recusa unidade de familia diferente da do insumo', () => {
    // 200 ml de um insumo vendido em kg nao faz sentido.
    expect(() => toBase(200, 'ML', 'G')).toThrow(UnitMismatchError);

    const ctx = buildCtx();
    ctx.recipes.get('burger')!.items[0] = {
      kind: 'INGREDIENT',
      ingredientId: 'carne',
      qty: 200,
      unit: 'ML',
    };
    expect(() => computeRecipeCost('burger', ctx)).toThrow(PricingError);
  });

  it('avisa quando o insumo referido nao existe', () => {
    const ctx = buildCtx();
    ctx.recipes.get('burger')!.items.push({
      kind: 'INGREDIENT',
      ingredientId: 'fantasma',
      qty: 1,
      unit: 'G',
    });
    expect(() => computeRecipeCost('burger', ctx)).toThrow(/nao encontrado/);
  });
});

describe('explosao de insumos (MRP)', () => {
  it('desce pelas sub-receitas ate aos insumos basicos', () => {
    const totals = explodeIngredients([{ recipeId: 'burger', qty: 100 }], buildCtx());

    expect(totals.get('carne')).toBeCloseTo(100 * 160, 8);
    expect(totals.get('pao')).toBeCloseTo(100, 8);
    // 100 x 30 ml de maionese = 3000 ml = 2,5 lotes de 1200 ml
    expect(totals.get('oleo')).toBeCloseTo((100 * 30) / 1200 * 1000, 8);
    expect(totals.get('ovo')).toBeCloseTo((100 * 30) / 1200 * 4, 8);
  });

  it('conta uma embalagem por porcao produzida', () => {
    const totals = explodeIngredients([{ recipeId: 'burger', qty: 100 }], buildCtx());
    expect(totals.get('caixa')).toBeCloseTo(100, 8);
    expect(totals.get('saco')).toBeCloseTo(100, 8);
  });

  it('aplica o fator de correcao: lista o que se compra, nao o que se usa', () => {
    const ctx = buildCtx();
    ctx.recipes.set('bife', {
      id: 'bife',
      name: 'Bife',
      kind: 'PRODUCT',
      yieldQty: 1,
      yieldUnit: 'UN',
      items: [{ kind: 'INGREDIENT', ingredientId: 'alcatra', qty: 200, unit: 'G' }],
    });

    const totals = explodeIngredients([{ recipeId: 'bife', qty: 10 }], ctx);
    // 10 x 200 g usados, mas com 20% de perda e preciso comprar 2500 g.
    expect(totals.get('alcatra')).toBeCloseTo(2500, 8);
  });

  it('bate com o custo calculado pela ficha tecnica', () => {
    const ctx = buildCtx();
    const totals = explodeIngredients([{ recipeId: 'burger', qty: 100 }], ctx);

    const viaMrp = [...totals.entries()].reduce(
      (acc, [id, qty]) => acc + qty * costPerBaseUnit(ctx.ingredients.get(id)!),
      0,
    );

    const cost = computeRecipeCost('burger', ctx);
    const viaFicha =
      100 * (cost.foodCostPerUnit + cost.packagingCost + cost.deliveryPackagingCost);

    expect(viaMrp).toBeCloseTo(viaFicha, 8);
  });

  it('deteta ciclo tambem na explosao', () => {
    const ctx = buildCtx();
    ctx.recipes.set('a', {
      id: 'a',
      name: 'A',
      kind: 'BASE',
      yieldQty: 100,
      yieldUnit: 'G',
      items: [{ kind: 'RECIPE', childRecipeId: 'b', qty: 10, unit: 'G' }],
    });
    ctx.recipes.set('b', {
      id: 'b',
      name: 'B',
      kind: 'BASE',
      yieldQty: 100,
      yieldUnit: 'G',
      items: [{ kind: 'RECIPE', childRecipeId: 'a', qty: 10, unit: 'G' }],
    });

    expect(() => explodeIngredients([{ recipeId: 'a', qty: 1 }], ctx)).toThrow(
      RecipeCycleError,
    );
  });
});
