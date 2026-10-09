/**
 * As actions de insumos e precos, contra a base a serio.
 *
 * Cada caso aqui corresponde a um defeito que existiu: o preco em uso que nao
 * se copiava para o insumo, o estoque que nascia sem entrada no livro, o
 * tamanho de embalagem que nao havia como corrigir. Testes escritos depois do
 * facto valem menos que testes escritos antes — mas valem muito mais que
 * nenhum, porque o que ja partiu uma vez costuma partir outra.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));

import { saveIngredient } from '@/lib/actions/ingredients';
import { deleteOffer, saveOffer, setOfferInUse } from '@/lib/actions/offers';
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

/** Cria um insumo marcado e devolve-o com o que lhe pertence. */
async function criarInsumo(campos: Record<string, string>) {
  const n = nome(campos.name ?? 'Insumo');
  const r = await saveIngredient(
    { ok: true },
    form({
      category: 'FOOD',
      purchaseUnit: 'KG',
      correctionFactor: '1',
      confirmDuplicate: '1',
      stockBase: '0',
      ...campos,
      name: n,
    }),
  );
  expect(r.ok, r.message).toBe(true);

  return prisma.ingredient.findFirstOrThrow({
    where: { name: n },
    include: { offers: { include: { supplier: true } }, movements: true },
  });
}

describe('criar um insumo', () => {
  it('nasce com o seu primeiro preco em uso', async () => {
    const i = await criarInsumo({ purchasePrice: '1,98', purchaseQty: '1' });

    expect(i.offers).toHaveLength(1);
    expect(i.offers[0].inUse).toBe(true);
    // O insumo e uma copia do preco em uso; e dai que o motor de custos le.
    expect(Number(i.purchasePrice)).toBeCloseTo(1.98, 6);
    expect(Number(i.purchaseQty)).toBeCloseTo(1, 6);
  });

  it('o campo de quantidade fala kg e a base guarda gramas', async () => {
    // 0,2 kg e uma embalagem de 200 g. Enquanto `0.200` era lido como 200,
    // insumos entraram com a embalagem mil vezes maior.
    const i = await criarInsumo({ purchasePrice: '3,73', purchaseQty: '0.200' });
    expect(Number(i.purchaseQty)).toBeCloseTo(0.2, 6);
    expect(i.baseUnit).toBe('G');
  });

  it('o estoque declarado fica no livro, e nao so no saldo', async () => {
    const i = await criarInsumo({
      purchasePrice: '1,98',
      purchaseQty: '1',
      stockBase: '3',
    });

    expect(Number(i.stockBase)).toBeCloseTo(3000, 6);
    expect(Number(i.avgCostBase)).toBeCloseTo(0.00198, 8);

    expect(i.movements).toHaveLength(1);
    expect(i.movements[0].kind).toBe('INVENTORY');
    expect(Number(i.movements[0].qtyBase)).toBeCloseTo(3000, 6);

    const soma = i.movements.reduce((a, m) => a + Number(m.qtyBase), 0);
    expect(soma).toBeCloseTo(Number(i.stockBase), 6);
  });

  it('sem estoque nao inventa movimento nem custo', async () => {
    const i = await criarInsumo({ purchasePrice: '1', purchaseQty: '1' });
    expect(i.movements).toHaveLength(0);
    expect(Number(i.avgCostBase)).toBe(0);
  });

  it('avisa de nomes parecidos sem bloquear', async () => {
    const base = nome('Acucar refinado');

    const primeiro = await saveIngredient(
      { ok: true },
      form({
        name: base,
        category: 'FOOD',
        purchaseUnit: 'KG',
        purchasePrice: '1,69',
        purchaseQty: '1',
        correctionFactor: '1',
        stockBase: '0',
        confirmDuplicate: '1',
      }),
    );
    expect(primeiro.ok).toBe(true);

    // Sem confirmacao, recusa e diz com o que se parece.
    const segundo = await saveIngredient(
      { ok: true },
      form({
        name: base,
        category: 'FOOD',
        purchaseUnit: 'KG',
        purchasePrice: '1,59',
        purchaseQty: '1',
        correctionFactor: '1',
        stockBase: '0',
      }),
    );
    expect(segundo.ok).toBe(false);
    expect(segundo.similar).toContain(base);

    // Com confirmacao, deixa — "Tomate" e "Tomate cereja" sao coisas
    // diferentes, e a aplicacao nao tem como saber qual e o caso.
    const terceiro = await saveIngredient(
      { ok: true },
      form({
        name: `${base} cereja`,
        category: 'FOOD',
        purchaseUnit: 'KG',
        purchasePrice: '1,59',
        purchaseQty: '1',
        correctionFactor: '1',
        stockBase: '0',
        confirmDuplicate: '1',
      }),
    );
    expect(terceiro.ok).toBe(true);
  });
});

describe('precos por fornecedor', () => {
  it('alterar o preco em uso recalcula o insumo', async () => {
    // O defeito: a action so copiava o preco para o insumo quando nao havia
    // nenhum em uso. Alterar o que estava em uso mudava a lista e deixava o
    // custo das fichas no valor antigo, sem avisar.
    const i = await criarInsumo({ purchasePrice: '2', purchaseQty: '200' });
    const oferta = i.offers[0];

    const r = await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        id: oferta.id,
        supplierId: '',
        purchasePrice: '2',
        purchaseQty: '0,2',
        purchaseUnit: 'KG',
      }),
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/recalculado/i);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: i.id } });
    expect(Number(depois.purchaseQty)).toBeCloseTo(0.2, 6);
  });

  it('um segundo preco nao mexe no que esta em uso', async () => {
    const i = await criarInsumo({ purchasePrice: '1,69', purchaseQty: '1' });
    const forn = await prisma.supplier.create({ data: { name: nome('Mercado') } });

    const r = await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        supplierId: forn.id,
        purchasePrice: '1,20',
        purchaseQty: '1',
        purchaseUnit: 'KG',
      }),
    );
    expect(r.ok, r.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({
      where: { id: i.id },
      include: { offers: true },
    });
    expect(depois.offers).toHaveLength(2);
    expect(depois.offers.filter((o) => o.inUse)).toHaveLength(1);
    // Anotar um preco para comparar nao pode mudar o custo dos produtos.
    expect(Number(depois.purchasePrice)).toBeCloseTo(1.69, 6);
  });

  it('trocar o preco em uso passa o custo para o novo', async () => {
    const i = await criarInsumo({ purchasePrice: '1,69', purchaseQty: '1' });
    const forn = await prisma.supplier.create({ data: { name: nome('Makro') } });

    await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        supplierId: forn.id,
        purchasePrice: '1,20',
        purchaseQty: '1',
        purchaseUnit: 'KG',
      }),
    );

    const barata = await prisma.supplierOffer.findFirstOrThrow({
      where: { ingredientId: i.id, supplierId: forn.id },
    });
    const r = await setOfferInUse({ ok: true }, form({ id: barata.id }));
    expect(r.ok, r.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({ where: { id: i.id } });
    expect(Number(depois.purchasePrice)).toBeCloseTo(1.2, 6);
    expect(depois.supplierId).toBe(forn.id);
  });

  it('recusa dois precos do mesmo fornecedor', async () => {
    const i = await criarInsumo({ purchasePrice: '1,69', purchaseQty: '1' });
    const forn = await prisma.supplier.create({ data: { name: nome('Continente') } });

    await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        supplierId: forn.id,
        purchasePrice: '1,20',
        purchaseQty: '1',
        purchaseUnit: 'KG',
      }),
    );

    // Tentar mover o preco sem fornecedor para um fornecedor que ja tem um.
    const semForn = await prisma.supplierOffer.findFirstOrThrow({
      where: { ingredientId: i.id, supplierId: null },
    });
    const r = await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        id: semForn.id,
        supplierId: forn.id,
        purchasePrice: '1,30',
        purchaseQty: '1',
        purchaseUnit: 'KG',
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ja existe um preco/i);
  });

  it('nao deixa apagar o ultimo preco', async () => {
    // Sem preco, o insumo ficava sem custo e as fichas que o usam mentiam.
    const i = await criarInsumo({ purchasePrice: '1,69', purchaseQty: '1' });
    const r = await deleteOffer({ ok: true }, form({ id: i.offers[0].id }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unico preco/i);
  });

  it('apagar o preco em uso passa ao mais barato dos restantes', async () => {
    const i = await criarInsumo({ purchasePrice: '1,69', purchaseQty: '1' });
    const forn = await prisma.supplier.create({ data: { name: nome('Recheio') } });

    await saveOffer(
      { ok: true },
      form({
        ingredientId: i.id,
        supplierId: forn.id,
        purchasePrice: '1,20',
        purchaseQty: '1',
        purchaseUnit: 'KG',
      }),
    );

    const r = await deleteOffer({ ok: true }, form({ id: i.offers[0].id }));
    expect(r.ok, r.message).toBe(true);

    const depois = await prisma.ingredient.findUniqueOrThrow({
      where: { id: i.id },
      include: { offers: true },
    });
    expect(depois.offers).toHaveLength(1);
    expect(depois.offers[0].inUse).toBe(true);
    expect(Number(depois.purchasePrice)).toBeCloseTo(1.2, 6);
  });
});
