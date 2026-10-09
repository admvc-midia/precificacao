/**
 * Cardapio, promocoes e cupoes contra a base: o preco que a encomenda grava
 * (cardapio + promocao do dia da entrega + combo desdobrado + cupao), os
 * limites do cupao, e o que o link publico mostra (e o que nao mostra).
 *
 * Tudo marcado com ZZTEMP- e apagado no fim (ver `limpar`).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import {
  adicionarProduto,
  apagarItem,
  guardarCombo,
  guardarDefinicoesDoCardapio,
  guardarSecao,
  alternarItem,
} from '@/lib/actions/cardapio';
import { createCustomerOrder, setCustomerOrderStatus, verificarCupao } from '@/lib/actions/encomendas';
import { guardarCupao, guardarPromocao } from '@/lib/actions/promocoes';
import { getCardapioPublico } from '@/lib/cardapio/consultas';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  MARCA,
  nome,
  prisma,
  reporSettings,
  retrato,
  type Retrato,
} from './base';
import { produto } from './ajudas';
import { comoSe } from './sessao-falsa';

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

async function ok(r: Promise<{ ok: boolean; message?: string }>) {
  const x = await r;
  expect(x.ok, x.message).toBe(true);
  return x;
}

async function criar(campos: Record<string, string>) {
  await expect(createCustomerOrder({ ok: true }, form(campos))).rejects.toThrow(/^REDIRECT \/encomendas\//);
}

describe('encomenda com cardapio, promocao, combo e cupao', () => {
  it('grava o preco certo em cada linha e conta os usos do cupao', async () => {
    const bolo = await produto(5); // tabela 5 €
    const caixa = await produto(10); // tabela 10 €

    const secao = nome('Secao');
    await ok(guardarSecao({ ok: true }, form({ name: secao, layout: 'LIST' })));
    const s = await prisma.menuSection.findFirstOrThrow({ where: { name: secao } });

    // Sem preco escrito, entra com o de tabela.
    await ok(adicionarProduto({ ok: true }, form({ recipeId: bolo.id, sectionId: s.id, price: '' })));
    const itemBolo = await prisma.menuItem.findUniqueOrThrow({ where: { recipeId: bolo.id } });
    expect(Number(itemBolo.price)).toBe(5);
    // A mesma ficha duas vezes, nao.
    const repetido = await adicionarProduto({ ok: true }, form({ recipeId: bolo.id, price: '' }));
    expect(repetido.ok).toBe(false);

    // Leve 3, pague 2 no bolo, a valer no dia da entrega.
    await ok(
      guardarPromocao(
        { ok: true },
        form({
          name: nome('Leve 3'),
          kind: 'BUY_X_PAY_Y',
          buyQty: '3',
          payQty: '2',
          startsAt: '2026-10-01',
          endsAt: '2026-10-31',
          menuItemId: itemBolo.id,
        }),
      ),
    );

    // Combo: 1 bolo (5) + 1 caixa (10) = 15 em separado; o combo custa 12.
    const nomeCombo = nome('Kit');
    const fc = form({ name: nomeCombo, price: '12', sectionId: s.id, 'comp.0.recipeId': bolo.id, 'comp.0.qty': '1', 'comp.1.recipeId': caixa.id, 'comp.1.qty': '1' });
    await ok(guardarCombo({ ok: true }, fc));
    const combo = await prisma.menuItem.findFirstOrThrow({ where: { name: nomeCombo } });

    // 10% em toda a encomenda, uma vez por cliente, sem se juntar a promocoes.
    const codigo = `${MARCA}CUP`.toUpperCase();
    await ok(
      guardarCupao(
        { ok: true },
        form({ code: codigo.toLowerCase(), kind: 'PERCENT', value: '10', startsAt: '2026-10-01', maxUsesPerCustomer: '1', scope: 'todos' }),
      ),
    );

    const pedido = {
      customerName: nome('Rita'),
      customerPhone: '+351 913 000 222',
      dueAt: '2026-10-15T12:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '3',
      'linha.1.recipeId': `combo:${combo.id}`,
      'linha.1.qty': '1',
      couponCode: codigo,
    };

    // "Verificar" diz quanto desconta sem gravar nada.
    const v = await verificarCupao({ ok: true }, form(pedido));
    expect(v.ok, v.message).toBe(true);
    expect(v.message).toMatch(/menos 1,20/);
    expect(await prisma.customerOrder.count({ where: { couponCode: codigo } })).toBe(0);

    await criar(pedido);
    const enc = await prisma.customerOrder.findFirstOrThrow({
      where: { customer: { name: pedido.customerName } },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    expect(enc.couponCode).toBe(codigo);
    expect(Number(enc.couponDiscount)).toBeCloseTo(1.2);

    const porReceita = (rid: string, menuItemId: string | null) =>
      enc.lines.find((l) => l.recipeId === rid && l.menuItemId === menuItemId)!;
    // Bolo: 3 com a promocao = 10 €; o cupao nao se junta a promocoes.
    const linhaBolo = porReceita(bolo.id, itemBolo.id);
    expect(linhaBolo.promotionId).not.toBeNull();
    expect(Number(linhaBolo.qty) * Number(linhaBolo.unitPrice)).toBeCloseTo(10);
    expect(linhaBolo.couponDiscount).toBeNull();
    expect(Number(linhaBolo.listPrice)).toBe(5);
    // Combo: 12 € repartidos 4 + 8 (pelo valor de cada ficha), menos 10%.
    const doComboBolo = porReceita(bolo.id, combo.id);
    const doComboCaixa = porReceita(caixa.id, combo.id);
    expect(Number(doComboBolo.unitPrice)).toBeCloseTo(3.6);
    expect(Number(doComboCaixa.unitPrice)).toBeCloseTo(7.2);
    expect(Number(doComboBolo.couponDiscount) + Number(doComboCaixa.couponDiscount)).toBeCloseTo(1.2);
    // Os custos ficam congelados por ficha, como sempre.
    expect(Number(doComboCaixa.unitFoodCost)).toBeCloseTo(0.4);

    // A mesma cliente (pelo telefone) ja o usou.
    const ritaS = nome('Rita S');
    const clientesAntes = await prisma.customer.count();
    const outra = await createCustomerOrder(
      { ok: true },
      form({ ...pedido, customerName: ritaS, customerPhone: '913000222' }),
    );
    expect(outra.ok).toBe(false);
    expect(outra.message).toMatch(/ja usou/);
    // A recusa nao deixou uma ficha de cliente nova para tras.
    expect(await prisma.customer.count()).toBe(clientesAntes);

    // Cancelada, deixa de contar.
    await ok(setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'CANCELLED' })));
    await criar({ ...pedido, customerName: ritaS, customerPhone: '913000222' });
  });
});

describe('o link publico', () => {
  it('so mostra o que esta publicado, e nunca custos', async () => {
    const bolo = await produto(5);
    const secao = nome('Publica');
    await ok(guardarSecao({ ok: true }, form({ name: secao, layout: 'GALLERY' })));
    const s = await prisma.menuSection.findFirstOrThrow({ where: { name: secao } });
    await ok(adicionarProduto({ ok: true }, form({ recipeId: bolo.id, sectionId: s.id, price: '6' })));
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { recipeId: bolo.id } });

    // Desligado: nada.
    await ok(guardarDefinicoesDoCardapio({ ok: true }, form({ menuPublishedSubmitted: '1' })));
    expect((await getCardapioPublico()).aberto).toBe(false);

    await ok(
      guardarDefinicoesDoCardapio(
        { ok: true },
        form({ menuPublishedSubmitted: '1', menuPublished: 'on', whatsappNumber: '924 005 977', instagramHandle: '@amo_brigs' }),
      ),
    );
    let d = await getCardapioPublico();
    expect(d.aberto).toBe(true);
    expect(d.whatsapp).toBe('351924005977');
    expect(d.instagram).toBe('amo_brigs');
    // O item nasce em rascunho.
    expect(d.secoes.flatMap((x) => x.itens).some((i) => i.id === item.id)).toBe(false);

    await ok(alternarItem({ ok: true }, form({ id: item.id, campo: 'published' })));
    d = await getCardapioPublico();
    const publico = d.secoes.find((x) => x.nome === secao)!;
    expect(publico.layout).toBe('GALLERY');
    const it = publico.itens.find((i) => i.id === item.id)!;
    expect(it.preco).toBe(6);
    // A ficha de teste nao tem alergenios revistos: nunca "sem alergenios".
    expect(it.alergenios.completo).toBe(false);
    // Nada de custos no que sai para o publico.
    expect(JSON.stringify(d)).not.toMatch(/cost|custo|foodCost|packaging/i);

    // Tirar do cardapio nao apaga a ficha.
    await ok(apagarItem({ ok: true }, form({ id: item.id })));
    expect(await prisma.recipe.count({ where: { id: bolo.id } })).toBe(1);
  });

  it('so o dono mexe no cardapio', async () => {
    comoSe('KITCHEN');
    try {
      const r = await guardarSecao({ ok: true }, form({ name: nome('Nao'), layout: 'LIST' }));
      expect(r).toEqual({ ok: false, message: 'Sem permissao para isto.' });
      const c = await guardarCupao({ ok: true }, form({ code: 'ZZTEMP-X', kind: 'PERCENT', value: '5', startsAt: '2026-10-01' }));
      expect(c.ok).toBe(false);
    } finally {
      comoSe('OWNER');
    }
  });
});
