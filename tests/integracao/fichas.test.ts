/**
 * Linhas da ficha tecnica, contra a base a serio.
 *
 * O caso que motivou este ficheiro: a quantidade passou a editar-se na propria
 * tabela, e essa edicao manda so a quantidade. A action gravava as notas a
 * partir do formulario, e um campo ausente virava nota vazia — o mesmo
 * defeito, "ausente tratado como vazio", que ja zerou as configuracoes.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));

import { saveIngredient } from '@/lib/actions/ingredients';
import { addRecipeItem, saveRecipe, updateRecipeItem } from '@/lib/actions/recipes';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  nome,
  prisma,
  retrato,
  reporSettings,
  type Retrato,
} from './base';

let antes: Retrato;

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
});

afterAll(async () => {
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

/** Uma ficha marcada com uma linha de 0,2 kg de um insumo marcado. */
async function fichaComUmaLinha() {
  const nomeInsumo = nome('Farinha');
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
  const rf = await saveRecipe(
    { ok: true },
    form({ name: nomeFicha, kind: 'PRODUCT', yieldQty: '1' }),
  );
  expect(rf.ok, rf.message).toBe(true);
  const ficha = await prisma.recipe.findFirstOrThrow({ where: { name: nomeFicha } });

  const rl = await addRecipeItem(
    { ok: true },
    form({ recipeId: ficha.id, ref: `ING:${insumo.id}`, qty: '0,2', unit: 'KG' }),
  );
  expect(rl.ok, rl.message).toBe(true);

  return prisma.recipeItem.findFirstOrThrow({ where: { recipeId: ficha.id } });
}

describe('alterar uma linha da ficha', () => {
  it('a edicao rapida (so quantidade) nao apaga as notas', async () => {
    const linha = await fichaComUmaLinha();

    // Pela janela: quantidade e notas.
    const r1 = await updateRecipeItem(
      { ok: true },
      form({ id: linha.id, qty: '0,2', unit: 'KG', notes: 'peneirada' }),
    );
    expect(r1.ok, r1.message).toBe(true);

    // Pela tabela: so a quantidade, como faz o QtyInline.
    const r2 = await updateRecipeItem(
      { ok: true },
      form({ id: linha.id, qty: '0,25', unit: 'KG' }),
    );
    expect(r2.ok, r2.message).toBe(true);

    const depois = await prisma.recipeItem.findUniqueOrThrow({ where: { id: linha.id } });
    expect(Number(depois.qty)).toBe(0.25);
    expect(depois.notes).toBe('peneirada');
  });

  it('o campo de notas enviado vazio apaga as notas', async () => {
    const linha = await fichaComUmaLinha();
    await updateRecipeItem(
      { ok: true },
      form({ id: linha.id, qty: '0,2', unit: 'KG', notes: 'peneirada' }),
    );

    const r = await updateRecipeItem(
      { ok: true },
      form({ id: linha.id, qty: '0,2', unit: 'KG', notes: '' }),
    );
    expect(r.ok, r.message).toBe(true);

    const depois = await prisma.recipeItem.findUniqueOrThrow({ where: { id: linha.id } });
    expect(depois.notes).toBeNull();
  });

  it('recusa quantidade zero e deixa a linha como estava', async () => {
    const linha = await fichaComUmaLinha();

    const r = await updateRecipeItem(
      { ok: true },
      form({ id: linha.id, qty: '0', unit: 'KG' }),
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/maior que zero/);

    const depois = await prisma.recipeItem.findUniqueOrThrow({ where: { id: linha.id } });
    expect(Number(depois.qty)).toBe(0.2);
  });
});
