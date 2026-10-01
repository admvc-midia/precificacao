/**
 * A aba de Compras contra a base a serio: juntar, riscar, achar mais barato
 * noutra loja, fechar — e o que isso faz ao estoque e aos precos.
 *
 * Tudo marcado com ZZTEMP- (lista, insumos, lojas) e apagado no fim.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { saveIngredient } from '@/lib/actions/ingredients';
import {
  addBelowMinimum,
  addFromOrder,
  addShoppingItem,
  closeShoppingList,
  setShoppingItemStatus,
  updateShoppingItem,
} from '@/lib/actions/shopping';
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

/** Uma loja marcada e um insumo com preco nela: 6,90 EUR por 1 kg. */
async function insumoNaLoja(extra: Record<string, string> = {}) {
  const loja = await prisma.supplier.create({ data: { name: nome('Loja') } });
  const n = nome('Queijo');
  const r = await saveIngredient(
    { ok: true },
    form({
      name: n,
      category: 'FOOD',
      supplierId: loja.id,
      purchaseUnit: 'KG',
      purchaseQty: '1',
      purchasePrice: '6,90',
      correctionFactor: '1',
      confirmDuplicate: '1',
      stockBase: '0',
      ...extra,
    }),
  );
  expect(r.ok, r.message).toBe(true);
  const insumo = await prisma.ingredient.findFirstOrThrow({ where: { name: n } });
  return { loja, insumo };
}

async function novaLista() {
  return prisma.shoppingList.create({ data: { name: nome('Lista') } });
}

async function itemDe(listId: string, ingredientId: string) {
  return prisma.shoppingItem.findFirstOrThrow({ where: { listId, ingredientId } });
}

describe('juntar a lista', () => {
  it('sem preco, usa o preco em uso; juntar outra vez soma embalagens', async () => {
    const { loja, insumo } = await insumoNaLoja();
    const lista = await novaLista();

    const r1 = await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '2' }));
    expect(r1.ok, r1.message).toBe(true);
    const r2 = await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));
    expect(r2.message).toMatch(/somei/);

    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id } });
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].packs)).toBe(3);
    expect(itens[0].supplierId).toBe(loja.id);
    expect(Number(itens[0].price)).toBe(6.9);
    expect(Number(itens[0].refPricePerBase)).toBeCloseTo(0.0069);
  });

  it('abaixo do minimo entra com as embalagens que faltam', async () => {
    const { insumo } = await insumoNaLoja({ stockBase: '0,2', minStockBase: '1,5' });
    const lista = await novaLista();

    const r = await addBelowMinimum({ ok: true }, form({ listId: lista.id }));
    expect(r.ok, r.message).toBe(true);
    const item = await itemDe(lista.id, insumo.id);
    // Faltam 1,3 kg; embalagens de 1 kg: 2.
    expect(Number(item.packs)).toBe(2);
  });
});

describe('uma linha por insumo', () => {
  const acheiMaisBarato = (listId: string, ingredientId: string, extra: Record<string, string> = {}) =>
    addShoppingItem(
      { ok: true },
      form({
        listId,
        ingredientId,
        packs: '4',
        price: '5,50',
        packQty: '1',
        packUnit: 'KG',
        supplierId: 'novo',
        newSupplierName: nome('Lidl'),
        ...extra,
      }),
    );

  it('achei mais barato corrige a linha que ja la estava, nao cria outra', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '2' }));

    const r = await acheiMaisBarato(lista.id, insumo.id);
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/ja estava na lista/);

    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id } });
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].price)).toBe(5.5);
    expect(Number(itens[0].packs)).toBe(4);
    expect(itens[0].status).toBe('PENDING');
  });

  it('"comprei" de um insumo que ja la estava risca essa mesma linha', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '2' }));

    await acheiMaisBarato(lista.id, insumo.id, { bought: '1' });
    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id } });
    expect(itens).toHaveLength(1);
    expect(itens[0].status).toBe('BOUGHT');
  });

  it('juntar um "nao havia" soma e volta a por comprar', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));
    const item = await itemDe(lista.id, insumo.id);
    await setShoppingItemStatus({ ok: true }, form({ id: item.id, status: 'MISSING' }));

    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '2' }));
    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id } });
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].packs)).toBe(3);
    expect(itens[0].status).toBe('PENDING');
  });

  it('o que ja esta no carrinho nao se mistura: precisar de mais e uma linha nova', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));
    const item = await itemDe(lista.id, insumo.id);
    await setShoppingItemStatus({ ok: true }, form({ id: item.id, status: 'BOUGHT' }));

    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '2' }));
    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id }, orderBy: { sortOrder: 'asc' } });
    expect(itens.map((i) => [i.status, Number(i.packs)])).toEqual([
      ['BOUGHT', 1],
      ['PENDING', 2],
    ]);
  });

  it('de uma producao: soma ao que ja la esta, e a mesma ordem so entra uma vez', async () => {
    const { insumo } = await insumoNaLoja();
    const ficha = await prisma.recipe.create({
      data: { name: nome('Tosta'), kind: 'PRODUCT', yieldQty: 1, yieldUnit: 'UN' },
    });
    await prisma.recipeItem.create({ data: { recipeId: ficha.id, ingredientId: insumo.id, qty: 0.5, unit: 'KG' } });
    const ordem = await prisma.productionOrder.create({
      data: { name: nome('Ordem'), lines: { create: { recipeId: ficha.id, qty: 3 } } },
    });
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));

    // 3 x 0,5 kg = 1,5 kg, sem estoque: 2 embalagens de 1 kg, somadas a 1.
    const r1 = await addFromOrder({ ok: true }, form({ listId: lista.id, orderId: ordem.id }));
    expect(r1.ok, r1.message).toBe(true);
    expect(r1.message).toMatch(/1 somado/);
    const itens = await prisma.shoppingItem.findMany({ where: { listId: lista.id } });
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].packs)).toBe(3);
    expect(itens[0].note).toContain(ordem.name);

    const r2 = await addFromOrder({ ok: true }, form({ listId: lista.id, orderId: ordem.id }));
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/ja foi juntada/);
    expect(Number((await itemDe(lista.id, insumo.id)).packs)).toBe(3);
  });
});

describe('fechar a compra', () => {
  it('da entrada ao preco pago e regista o preco da outra loja sem o por em uso', async () => {
    const { loja, insumo } = await insumoNaLoja();
    const lista = await novaLista();
    const outraLoja = nome('Makro');

    // Achei mais barato noutra loja, e comprei ja.
    const r = await addShoppingItem(
      { ok: true },
      form({
        listId: lista.id,
        ingredientId: insumo.id,
        packs: '2',
        price: '5,90',
        packQty: '1',
        packUnit: 'KG',
        supplierId: 'novo',
        newSupplierName: outraLoja,
        bought: '1',
      }),
    );
    expect(r.ok, r.message).toBe(true);

    const f = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(f.ok, f.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(Number(depois.stockBase)).toBe(2000);
    expect(Number(depois.avgCostBase)).toBeCloseTo(0.0059);
    // O preco em uso continua o da loja de sempre.
    expect(depois.supplierId).toBe(loja.id);
    expect(Number(depois.purchasePrice)).toBe(6.9);

    const makro = await prisma.supplier.findFirstOrThrow({ where: { name: outraLoja } });
    const oferta = await prisma.supplierOffer.findFirstOrThrow({
      where: { ingredientId: insumo.id, supplierId: makro.id },
    });
    expect(Number(oferta.purchasePrice)).toBe(5.9);
    expect(oferta.inUse).toBe(false);

    const mov = await prisma.stockMovement.findMany({ where: { ingredientId: insumo.id } });
    expect(mov.filter((m) => m.kind === 'PURCHASE')).toHaveLength(1);
  });

  it('com "usar daqui para a frente", o preco novo passa a valer', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    const outraLoja = nome('Lidl');
    await addShoppingItem(
      { ok: true },
      form({
        listId: lista.id,
        ingredientId: insumo.id,
        packs: '1',
        price: '5,50',
        packQty: '1',
        packUnit: 'KG',
        supplierId: 'novo',
        newSupplierName: outraLoja,
        bought: '1',
        useAsCurrent: '1',
      }),
    );
    const f = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(f.ok, f.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(Number(depois.purchasePrice)).toBe(5.5);
    const emUso = await prisma.supplierOffer.findMany({ where: { ingredientId: insumo.id, inUse: true } });
    expect(emUso).toHaveLength(1);
  });

  it('a loja do preco em uso mudou o preco: o novo passa a valer', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));
    const item = await itemDe(lista.id, insumo.id);

    const u = await updateShoppingItem({ ok: true }, form({ id: item.id, price: '7,20' }));
    expect(u.ok, u.message).toBe(true);
    await setShoppingItemStatus({ ok: true }, form({ id: item.id, status: 'BOUGHT' }));
    const f = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(f.ok, f.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(Number(depois.purchasePrice)).toBe(7.2);
  });

  it('so entra o riscado; "nao havia" e por comprar ficam de fora', async () => {
    const a = await insumoNaLoja();
    const b = await insumoNaLoja();
    const c = await insumoNaLoja();
    const lista = await novaLista();
    for (const x of [a, b, c]) {
      await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: x.insumo.id, packs: '1' }));
    }
    await setShoppingItemStatus({ ok: true }, form({ id: (await itemDe(lista.id, a.insumo.id)).id, status: 'BOUGHT' }));
    await setShoppingItemStatus({ ok: true }, form({ id: (await itemDe(lista.id, b.insumo.id)).id, status: 'MISSING' }));

    const f = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(f.ok, f.message).toBe(true);

    const [ia, ib, ic] = await Promise.all(
      [a, b, c].map((x) => prisma.ingredient.findUniqueOrThrow({ where: { id: x.insumo.id } })),
    );
    expect(Number(ia.stockBase)).toBe(1000);
    expect(Number(ib.stockBase)).toBe(0);
    expect(Number(ic.stockBase)).toBe(0);
  });

  it('nao fecha sem nada riscado, nao fecha duas vezes, e fechada nao se edita', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    await addShoppingItem({ ok: true }, form({ listId: lista.id, ingredientId: insumo.id, packs: '1' }));
    const item = await itemDe(lista.id, insumo.id);

    const vazio = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(vazio.ok).toBe(false);
    expect(vazio.message).toMatch(/Nada riscado/);

    await setShoppingItemStatus({ ok: true }, form({ id: item.id, status: 'BOUGHT' }));
    expect((await closeShoppingList({ ok: true }, form({ id: lista.id }))).ok).toBe(true);

    const outra = await closeShoppingList({ ok: true }, form({ id: lista.id }));
    expect(outra.ok).toBe(false);
    expect(outra.message).toMatch(/ja foi fechada/);

    const editar = await updateShoppingItem({ ok: true }, form({ id: item.id, price: '1' }));
    expect(editar.ok).toBe(false);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(Number(depois.stockBase)).toBe(1000);
  });

  it('recusa embalagem noutra familia de unidade', async () => {
    const { insumo } = await insumoNaLoja();
    const lista = await novaLista();
    const r = await addShoppingItem(
      { ok: true },
      form({ listId: lista.id, ingredientId: insumo.id, packs: '1', price: '1', packQty: '1', packUnit: 'L' }),
    );
    expect(r.ok).toBe(false);
    expect(await prisma.shoppingItem.count({ where: { listId: lista.id } })).toBe(0);
  });
});
