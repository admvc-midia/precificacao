/**
 * Ajudas partilhadas pelos testes de integracao que precisam de um produto
 * pronto a vender. Fora de `base.ts` de proposito: aquele so mexe na base,
 * isto passa pelas actions (e por isso precisa da sessao falsa).
 */

import { expect } from 'vitest';

import { saveIngredient } from '@/lib/actions/ingredients';
import { addRecipeItem, saveRecipe } from '@/lib/actions/recipes';
import { form, nome, prisma } from './base';

/**
 * Um produto marcado: 0,2 kg de um insumo a 2 EUR/kg (custo 0,40), vendido a
 * `precoManual` em preco manual. Com `null`, fica no modo por omissao.
 */
export async function produto(precoManual: number | null = 5) {
  const nomeInsumo = nome('Chocolate');
  const ri = await saveIngredient(
    { ok: true },
    form({
      name: nomeInsumo,
      category: 'FOOD',
      purchaseUnit: 'KG',
      purchaseQty: '1',
      purchasePrice: '2',
      correctionFactor: '1',
      confirmDuplicate: '1',
      stockBase: '0',
    }),
  );
  expect(ri.ok, ri.message).toBe(true);
  const insumo = await prisma.ingredient.findFirstOrThrow({ where: { name: nomeInsumo } });

  const nomeFicha = nome('Bolo');
  const rf = await saveRecipe({ ok: true }, form({ name: nomeFicha, kind: 'PRODUCT', yieldQty: '1' }));
  expect(rf.ok, rf.message).toBe(true);
  const ficha = await prisma.recipe.findFirstOrThrow({ where: { name: nomeFicha } });

  const rl = await addRecipeItem(
    { ok: true },
    form({ recipeId: ficha.id, ref: `ING:${insumo.id}`, qty: '0,2', unit: 'KG' }),
  );
  expect(rl.ok, rl.message).toBe(true);

  if (precoManual !== null) {
    await prisma.recipe.update({
      where: { id: ficha.id },
      data: { pricingMode: 'MANUAL', manualPrice: precoManual },
    });
  }
  return ficha;
}
