import { describe, expect, it } from 'vitest';

import { PricingError } from '@/lib/pricing/cost';
import {
  buildPurchaseList,
  demandConsumptionCost,
  lowStockOutside,
  type PurchaseLine,
} from '@/lib/pricing/purchase';
import type { CostContext, IngredientInput, RecipeInput } from '@/lib/pricing/types';

function ingredient(
  id: string,
  purchasePrice: number,
  purchaseQty: number,
  purchaseUnit: IngredientInput['purchaseUnit'],
  extra: Partial<IngredientInput> = {},
): IngredientInput {
  return {
    id,
    name: id,
    category: 'FOOD',
    purchasePrice,
    purchaseQty,
    purchaseUnit,
    correctionFactor: 1,
    stockBase: 0,
    ...extra,
  };
}

function buildCtx(overrides: Partial<IngredientInput> & { id?: string } = {}): CostContext {
  const ingredients = new Map<string, IngredientInput>(
    [
      // Pacote de 5 kg. Comprar 1 kg obriga a levar os 5.
      ingredient('carne', 12.5, 5, 'KG', { supplierId: 's1', supplierName: 'Talho' }),
      // Embalagem de 24 unidades.
      ingredient('pao', 3.6, 24, 'UN', {
        supplierId: 's2',
        supplierName: 'Continente',
      }),
      ingredient('queijo', 6.9, 1, 'KG', {
        supplierId: 's2',
        supplierName: 'Continente',
      }),
      // Com perda de 20% na limpeza.
      ingredient('alcatra', 18, 1, 'KG', {
        correctionFactor: 1.25,
        supplierId: 's1',
        supplierName: 'Talho',
      }),
      // Sem fornecedor atribuido.
      ingredient('sal', 0.45, 1, 'KG'),
      ingredient('caixa', 12, 100, 'UN', {
        category: 'PACKAGING',
        supplierId: 's3',
        supplierName: 'Makro',
      }),
    ].map((i) => [i.id, { ...i, ...(overrides.id === i.id ? overrides : {}) }]),
  );

  const recipes = new Map<string, RecipeInput>(
    (
      [
        {
          id: 'burger',
          name: 'Hamburguer',
          kind: 'PRODUCT',
          yieldQty: 1,
          yieldUnit: 'UN',
          packagingId: 'caixa',
          items: [
            { kind: 'INGREDIENT', ingredientId: 'carne', qty: 160, unit: 'G' },
            { kind: 'INGREDIENT', ingredientId: 'pao', qty: 1, unit: 'UN' },
            { kind: 'INGREDIENT', ingredientId: 'queijo', qty: 40, unit: 'G' },
            { kind: 'INGREDIENT', ingredientId: 'sal', qty: 2, unit: 'G' },
          ],
        },
        {
          id: 'premium',
          name: 'Premium',
          kind: 'PRODUCT',
          yieldQty: 1,
          yieldUnit: 'UN',
          items: [
            { kind: 'INGREDIENT', ingredientId: 'alcatra', qty: 200, unit: 'G' },
          ],
        },
      ] as RecipeInput[]
    ).map((r) => [r.id, r]),
  );

  return { ingredients, recipes };
}

const find = (lines: PurchaseLine[], id: string) =>
  lines.find((l) => l.ingredient.id === id)!;

describe('embalagem inteira', () => {
  it('arredonda para cima: nao se compra fracao de pacote', () => {
    // 10 hamburgueres = 1600 g de carne, mas o pacote e de 5 kg.
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], buildCtx());
    const carne = find(list.lines, 'carne');

    expect(carne.missingBase).toBeCloseTo(1600, 8);
    expect(carne.packsToBuy).toBe(1);
    expect(carne.purchasedBase).toBeCloseTo(5000, 8);
    expect(carne.cost).toBeCloseTo(12.5, 8);
  });

  it('conta a sobra que fica em despensa', () => {
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], buildCtx());
    const carne = find(list.lines, 'carne');

    expect(carne.leftoverBase).toBeCloseTo(3400, 8);
    // Consumo real: 1600 g a 0,0025/g = 4,00.
    expect(carne.theoreticalCost).toBeCloseTo(4.0, 8);
    expect(carne.cost).toBeGreaterThan(carne.theoreticalCost);
  });

  it('compra varios pacotes quando um nao chega', () => {
    // 100 paes, embalagem de 24 -> 5 embalagens (120 paes).
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 100 }], buildCtx());
    const pao = find(list.lines, 'pao');

    expect(pao.missingBase).toBeCloseTo(100, 8);
    expect(pao.packsToBuy).toBe(5);
    expect(pao.purchasedBase).toBeCloseTo(120, 8);
    expect(pao.leftoverBase).toBeCloseTo(20, 8);
    expect(pao.cost).toBeCloseTo(5 * 3.6, 8);
  });

  it('nao compra um pacote a mais por erro de virgula flutuante', () => {
    // 48 paes = exatamente 2 embalagens de 24. Sem a tolerancia, a divisao
    // podia dar 2.0000000001 e mandar comprar 3.
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 48 }], buildCtx());
    expect(find(list.lines, 'pao').packsToBuy).toBe(2);
  });

  it('aplica o fator de correcao antes de decidir quanto comprar', () => {
    // 10 x 200 g usados, mas com FC 1,25 e preciso comprar 2500 g.
    const list = buildPurchaseList([{ recipeId: 'premium', qty: 10 }], buildCtx());
    const alcatra = find(list.lines, 'alcatra');

    expect(alcatra.requiredBase).toBeCloseTo(2500, 8);
    expect(alcatra.packsToBuy).toBe(3); // pacotes de 1 kg
    expect(alcatra.cost).toBeCloseTo(54, 8);
  });
});

describe('estoque', () => {
  it('desconta o que ja existe em casa', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('carne')!.stockBase = 1000;

    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const carne = find(list.lines, 'carne');

    expect(carne.requiredBase).toBeCloseTo(1600, 8);
    expect(carne.stockBase).toBe(1000);
    expect(carne.missingBase).toBeCloseTo(600, 8);
    expect(carne.packsToBuy).toBe(1);
  });

  it('nao compra nada quando o estoque cobre tudo', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('carne')!.stockBase = 99999;

    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const carne = find(list.lines, 'carne');

    expect(carne.missingBase).toBe(0);
    expect(carne.packsToBuy).toBe(0);
    expect(carne.cost).toBe(0);
    expect(list.coveredByStock.map((l) => l.ingredient.id)).toContain('carne');
    expect(list.bySupplier.flatMap((g) => g.lines.map((l) => l.ingredient.id))).not.toContain(
      'carne',
    );
  });

  it('estoque maior que a necessidade nao gera falta negativa', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('pao')!.stockBase = 500;

    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    expect(find(list.lines, 'pao').missingBase).toBe(0);
  });

  it('ignoreStock orcamenta como se a despensa estivesse vazia', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('carne')!.stockBase = 99999;

    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx, {
      ignoreStock: true,
    });
    const carne = find(list.lines, 'carne');

    expect(carne.stockBase).toBe(0);
    expect(carne.packsToBuy).toBe(1);
  });
});

describe('agrupamento por fornecedor', () => {
  it('divide a lista por loja', () => {
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 100 }], buildCtx());
    const names = list.bySupplier.map((g) => g.supplierName);

    expect(names).toContain('Talho');
    expect(names).toContain('Continente');
    expect(names).toContain('Makro');

    const continente = list.bySupplier.find((g) => g.supplierName === 'Continente')!;
    expect(continente.lines.map((l) => l.ingredient.id).sort()).toEqual([
      'pao',
      'queijo',
    ]);
    expect(continente.total).toBeCloseTo(
      continente.lines.reduce((a, l) => a + l.cost, 0),
      8,
    );
  });

  it('poe "sem fornecedor" no fim — nao e uma loja onde se passa', () => {
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 100 }], buildCtx());
    expect(list.bySupplier.at(-1)!.supplierName).toBe('Sem fornecedor');
    expect(list.bySupplier.at(-1)!.lines.map((l) => l.ingredient.id)).toEqual(['sal']);
  });

  it('a soma dos grupos e o total da lista', () => {
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 100 }], buildCtx());
    const soma = list.bySupplier.reduce((a, g) => a + g.total, 0);
    expect(soma).toBeCloseTo(list.totalCost, 8);
  });
});

describe('custo de compra x custo de consumo', () => {
  it('a compra nunca custa menos do que se vai consumir', () => {
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], buildCtx());
    expect(list.totalCost).toBeGreaterThanOrEqual(list.theoreticalCost - 1e-9);
    expect(list.leftoverCost).toBeCloseTo(list.totalCost - list.theoreticalCost, 8);
    expect(list.leftoverCost).toBeGreaterThan(0);
  });

  it('o custo de consumo bate com a soma das fichas tecnicas', () => {
    const ctx = buildCtx();
    const consumo = demandConsumptionCost([{ recipeId: 'burger', qty: 100 }], ctx);

    // Calculado a mao: 100 porcoes.
    const esperado =
      100 * 160 * (12.5 / 5000) + // carne
      100 * (3.6 / 24) + // pao
      100 * 40 * (6.9 / 1000) + // queijo
      100 * 2 * (0.45 / 1000) + // sal
      100 * (12 / 100); // caixa

    expect(consumo).toBeCloseTo(esperado, 8);
  });

  it('o estoque reduz o desembolso mas nao o custo de producao', () => {
    const ctx = buildCtx();
    const semEstoque = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const consumoAntes = demandConsumptionCost([{ recipeId: 'burger', qty: 10 }], ctx);

    ctx.ingredients.get('carne')!.stockBase = 99999;
    const comEstoque = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const consumoDepois = demandConsumptionCost([{ recipeId: 'burger', qty: 10 }], ctx);

    // Ter carne em casa poupa a compra dela.
    expect(comEstoque.totalCost).toBeLessThan(semEstoque.totalCost);
    // Mas o custo de produzir os 10 hamburgueres e o mesmo: a carne foi
    // paga noutro dia, nao deixou de ser consumida.
    expect(consumoDepois).toBeCloseTo(consumoAntes, 10);
  });

  it('num lote pequeno a embalagem minima faz o desembolso passar o consumo', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('carne')!.stockBase = 99999;

    const lista = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const consumo = demandConsumptionCost([{ recipeId: 'burger', qty: 10 }], ctx);

    // Para 10 hamburgueres gastam-se 400 g de queijo e 20 g de sal, mas
    // compram-se 1 kg de cada; e 10 caixas, mas o pacote tem 100. O
    // desembolso de hoje fica muito acima do custo da producao — e e por
    // isso que as duas contas nao podem ser a mesma.
    expect(lista.totalCost).toBeGreaterThan(consumo);
    expect(lista.leftoverCost).toBeGreaterThan(0);
  });

  it('escala linearmente com a quantidade', () => {
    const ctx = buildCtx();
    const um = demandConsumptionCost([{ recipeId: 'burger', qty: 1 }], ctx);
    const cem = demandConsumptionCost([{ recipeId: 'burger', qty: 100 }], ctx);
    expect(cem).toBeCloseTo(um * 100, 8);
  });
});

describe('varios produtos na mesma ordem', () => {
  it('soma a necessidade do mesmo insumo em produtos diferentes', () => {
    const ctx = buildCtx();
    // Ambos usam alcatra? Nao — mas ambos passam a usar sal.
    ctx.recipes.get('premium')!.items.push({
      kind: 'INGREDIENT',
      ingredientId: 'sal',
      qty: 3,
      unit: 'G',
    });

    const list = buildPurchaseList(
      [
        { recipeId: 'burger', qty: 10 },
        { recipeId: 'premium', qty: 10 },
      ],
      ctx,
    );

    // 10 x 2 g + 10 x 3 g = 50 g
    expect(find(list.lines, 'sal').requiredBase).toBeCloseTo(50, 8);
  });
});

describe('erros', () => {
  it('avisa quando a embalagem de compra e zero', () => {
    const ctx = buildCtx();
    ctx.ingredients.get('carne')!.purchaseQty = 0;
    expect(() => buildPurchaseList([{ recipeId: 'burger', qty: 1 }], ctx)).toThrow(
      PricingError,
    );
  });

  it('avisa quando a ficha nao existe', () => {
    expect(() =>
      buildPurchaseList([{ recipeId: 'fantasma', qty: 1 }], buildCtx()),
    ).toThrow(PricingError);
  });

  it('demanda vazia devolve lista vazia', () => {
    const list = buildPurchaseList([], buildCtx());
    expect(list.lines).toHaveLength(0);
    expect(list.totalCost).toBe(0);
    expect(list.bySupplier).toHaveLength(0);
  });
});

describe('estoque minimo', () => {
  // 10 hamburgueres gastam 400 g de queijo (40 g cada). Pacote de 1 kg a 6,90.

  it('sem minimo definido fica tudo como antes', () => {
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 1000 }),
    );
    const queijo = find(list.lines, 'queijo');
    expect(queijo.minBase).toBe(0);
    expect(queijo.forMinimumBase).toBe(0);
    expect(queijo.packsToBuy).toBe(0);
  });

  it('compra para produzir e ainda ficar com o minimo', () => {
    // Ha 1 kg, a producao gasta 400 g, ficariam 600 g — abaixo dos 800 g.
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 1000, minStockBase: 800 }),
    );
    const queijo = find(list.lines, 'queijo');
    expect(queijo.missingBase).toBeCloseTo(200, 8);
    expect(queijo.forMinimumBase).toBeCloseTo(200, 8);
    expect(queijo.packsToBuy).toBe(1);
  });

  it('com o minimo ja coberto nao compra nada', () => {
    // 2 kg - 400 g = 1,6 kg, acima dos 800 g.
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 2000, minStockBase: 800 }),
    );
    const queijo = find(list.lines, 'queijo');
    expect(queijo.missingBase).toBe(0);
    expect(queijo.forMinimumBase).toBe(0);
    expect(queijo.packsToBuy).toBe(0);
  });

  it('a reposicao do minimo nao entra no custo da producao', () => {
    // Ha 300 g, faltam 100 g para produzir e mais 500 g para o minimo.
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 300, minStockBase: 500 }),
    );
    const queijo = find(list.lines, 'queijo');
    expect(queijo.missingBase).toBeCloseTo(600, 8);
    expect(queijo.forMinimumBase).toBeCloseTo(500, 8);
    expect(queijo.packsToBuy).toBe(1);
    // So os 100 g da producao contam como consumo; o resto fica em despensa.
    expect(queijo.theoreticalCost).toBeCloseTo(0.69, 8);
    expect(queijo.cost).toBeCloseTo(6.9, 8);
  });

  it('orcamentar do zero (ignoreStock) nao soma o minimo', () => {
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 0, minStockBase: 5000 }),
      { ignoreStock: true },
    );
    const queijo = find(list.lines, 'queijo');
    expect(queijo.missingBase).toBeCloseTo(400, 8);
    expect(queijo.forMinimumBase).toBe(0);
  });

  it('um minimo negativo (dado estragado) conta como sem minimo', () => {
    const list = buildPurchaseList(
      [{ recipeId: 'burger', qty: 10 }],
      buildCtx({ id: 'queijo', stockBase: 1000, minStockBase: -50 }),
    );
    expect(find(list.lines, 'queijo').missingBase).toBe(0);
  });
});

describe('tambem a acabar (fora da ordem)', () => {
  it('mostra o que esta no minimo e a ordem nao usa, sem o por na compra', () => {
    // A alcatra so entra no "premium", que nao esta nesta ordem.
    const ctx = buildCtx({ id: 'alcatra', stockBase: 200, minStockBase: 500 });
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);

    const fora = lowStockOutside(list, ctx);
    expect(fora.map((l) => l.ingredient.id)).toEqual(['alcatra']);
    expect(fora[0].missingBase).toBeCloseTo(300, 8);
    // E nao foi parar a compra.
    expect(list.lines.some((l) => l.ingredient.id === 'alcatra')).toBe(false);
  });

  it('nao repete o que ja esta na lista, nem o que esta acima do minimo', () => {
    const base = buildCtx({ id: 'queijo', stockBase: 100, minStockBase: 500 });
    // Alcatra acima do minimo: nao e alerta.
    base.ingredients.set('alcatra', {
      ...base.ingredients.get('alcatra')!,
      stockBase: 900,
      minStockBase: 500,
    });
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], base);
    expect(lowStockOutside(list, base)).toEqual([]);
  });

  it('exatamente no minimo ja conta — e o ponto em que se compra', () => {
    const ctx = buildCtx({ id: 'alcatra', stockBase: 500, minStockBase: 500 });
    const list = buildPurchaseList([{ recipeId: 'burger', qty: 10 }], ctx);
    const fora = lowStockOutside(list, ctx);
    expect(fora).toHaveLength(1);
    expect(fora[0].missingBase).toBe(0);
  });
});
