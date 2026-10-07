/**
 * Encomendas contra a base a serio: criar com o preco de tabela, reconhecer o
 * cliente pelo telefone, mandar para producao, entregar — e o que isso faz as
 * Vendas.
 *
 * Tudo marcado com ZZTEMP- (clientes, fichas, insumos) e apagado no fim. As
 * ordens de producao que nascem daqui tem nome de data; a limpeza apanha-as
 * pelas encomendas marcadas.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import {
  addCustomerOrderLine,
  deleteCustomerOrder,
  createCustomerOrder,
  produceCustomerOrders,
  setCustomerOrderPayment,
  setCustomerOrderStatus,
  updateCustomerOrder,
} from '@/lib/actions/encomendas';
import { updateCustomer } from '@/lib/actions/clientes';
import { mesEmLisboa } from '@/lib/datas';
import { getDeliveredOrders } from '@/lib/queries';
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

/** Cria e devolve a encomenda; a action acaba num redirect para ela. */
async function criar(campos: Record<string, string>) {
  await expect(createCustomerOrder({ ok: true }, form(campos))).rejects.toThrow(
    /^REDIRECT \/encomendas\//,
  );
}

describe('encomendas', () => {
  it('nasce com o preco de tabela e o custo do dia, e reconhece o cliente pelo telefone', async () => {
    const bolo = await produto(5);
    const ana = nome('Ana');

    await criar({
      customerName: ana,
      customerPhone: '+351 912 000 111',
      contactConsent: 'on',
      dueAt: '2026-10-08T15:30',
      fulfillment: 'PICKUP',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '2',
      'linha.0.price': '',
    });

    const cliente = await prisma.customer.findFirstOrThrow({ where: { name: ana } });
    expect(cliente.contactConsentAt).not.toBeNull();

    const enc = await prisma.customerOrder.findFirstOrThrow({
      where: { customerId: cliente.id },
      include: { lines: true },
    });
    expect(enc.dueAt.toISOString()).toBe('2026-10-08T15:30:00.000Z');
    expect(enc.status).toBe('REQUESTED');
    expect(enc.lines).toHaveLength(1);
    expect(Number(enc.lines[0].unitPrice)).toBe(5);
    expect(Number(enc.lines[0].listPrice)).toBe(5);
    expect(Number(enc.lines[0].unitFoodCost)).toBeCloseTo(0.4);

    // O mesmo telefone escrito de outra forma, com outro nome: o mesmo cliente.
    await criar({
      customerName: nome('Ana Silva'),
      customerPhone: '912000111',
      dueAt: '2026-10-09T10:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '1',
      'linha.0.price': '4,50',
    });
    const encs = await prisma.customerOrder.findMany({
      where: { customerId: cliente.id },
      include: { lines: true },
    });
    expect(encs).toHaveLength(2);
    const segunda = encs.find((e) => e.id !== enc.id)!;
    expect(Number(segunda.lines[0].unitPrice)).toBe(4.5);
    expect(Number(segunda.lines[0].listPrice)).toBe(5);
  });

  it('recusa sem morada para entregar, e sem preco quando a ficha nao tem', async () => {
    const bolo = await produto(5);
    const r1 = await createCustomerOrder(
      { ok: true },
      form({
        customerName: nome('Rui'),
        dueAt: '2026-10-08T15:30',
        fulfillment: 'DELIVERY',
        'linha.0.recipeId': bolo.id,
        'linha.0.qty': '1',
      }),
    );
    expect(r1.ok).toBe(false);
    expect(r1.message).toMatch(/morada/);

    const semPreco = await produto(null);
    // Preco por CMV alvo existe sempre que ha custo; forcar "sem preco" com o manual a 0.
    await prisma.recipe.update({
      where: { id: semPreco.id },
      data: { pricingMode: 'MANUAL', manualPrice: 0 },
    });
    const r2 = await createCustomerOrder(
      { ok: true },
      form({
        customerName: nome('Rui'),
        dueAt: '2026-10-08T15:30',
        'linha.0.recipeId': semPreco.id,
        'linha.0.qty': '1',
      }),
    );
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/preco/i);
  });

  it('vai para producao com os produtos somados, e conta nas Vendas so quando entregue', async () => {
    const bolo = await produto(5);
    const cliente = nome('Maria');
    await criar({
      customerName: cliente,
      dueAt: '2026-10-10T09:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '3',
    });
    await criar({
      customerName: nome('Joana'),
      dueAt: '2026-10-09T18:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '2',
    });
    const encs = await prisma.customerOrder.findMany({
      where: { lines: { some: { recipeId: bolo.id } } },
    });
    expect(encs).toHaveLength(2);

    const f = new FormData();
    for (const e of encs) f.append('ids', e.id);
    await expect(produceCustomerOrders({ ok: true }, f)).rejects.toThrow(/^REDIRECT \/producao\//);

    const ordem = await prisma.productionOrder.findFirstOrThrow({
      where: { customerOrders: { some: { id: encs[0].id } } },
      include: { lines: true },
    });
    expect(ordem.lines).toEqual([expect.objectContaining({ recipeId: bolo.id })]);
    expect(Number(ordem.lines[0].qty)).toBe(5);
    // O dia da primeira entrega (9), nao o da segunda.
    expect(ordem.dueAt!.toISOString()).toBe('2026-10-09T00:00:00.000Z');

    const depois = await prisma.customerOrder.findMany({ where: { id: { in: encs.map((e) => e.id) } } });
    expect(depois.every((e) => e.status === 'IN_PRODUCTION')).toBe(true);

    // Mandar outra vez e recusado.
    const r = await produceCustomerOrders({ ok: true }, f);
    expect(r.ok).toBe(false);

    // Entregar marca o dia, e a venda aparece no mes.
    const id = encs[0].id;
    const r1 = await setCustomerOrderStatus({ ok: true }, form({ id, status: 'DELIVERED' }));
    expect(r1.ok, r1.message).toBe(true);
    const entregue = await prisma.customerOrder.findUniqueOrThrow({ where: { id } });
    expect(entregue.deliveredAt).not.toBeNull();
    const periodo = mesEmLisboa(entregue.deliveredAt!);
    const linhas = (await getDeliveredOrders(periodo)).flatMap((o) => o.lines);
    expect(linhas.some((l) => l.recipeId === bolo.id)).toBe(true);

    // Voltar atras tira-a das Vendas.
    await setCustomerOrderStatus({ ok: true }, form({ id, status: 'READY' }));
    const voltou = await prisma.customerOrder.findUniqueOrThrow({ where: { id } });
    expect(voltou.deliveredAt).toBeNull();
    expect(((await getDeliveredOrders(periodo)).flatMap((o) => o.lines)).some((l) => l.recipeId === bolo.id)).toBe(false);
  });

  it('o mesmo produto ao mesmo preco soma; a outro preco e outra linha', async () => {
    const bolo = await produto(5);
    await criar({
      customerName: nome('Leo'),
      dueAt: '2026-10-08T12:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '1',
    });
    const enc = await prisma.customerOrder.findFirstOrThrow({
      where: { lines: { some: { recipeId: bolo.id } } },
    });

    expect((await addCustomerOrderLine({ ok: true }, form({ orderId: enc.id, recipeId: bolo.id, qty: '2' }))).ok).toBe(true);
    expect(
      (await addCustomerOrderLine({ ok: true }, form({ orderId: enc.id, recipeId: bolo.id, qty: '1', price: '3' }))).ok,
    ).toBe(true);

    const linhas = await prisma.customerOrderLine.findMany({
      where: { orderId: enc.id },
      orderBy: { unitPrice: 'desc' },
    });
    expect(linhas.map((l) => [Number(l.qty), Number(l.unitPrice)])).toEqual([
      [3, 5],
      [1, 3],
    ]);
  });

  it('alterar so as notas nao apaga a morada nem a data (ausente ≠ vazio)', async () => {
    const bolo = await produto(5);
    await criar({
      customerName: nome('Rita'),
      dueAt: '2026-10-08T12:00',
      fulfillment: 'DELIVERY',
      address: 'Rua das Flores 1',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '1',
    });
    const enc = await prisma.customerOrder.findFirstOrThrow({
      where: { lines: { some: { recipeId: bolo.id } } },
    });

    const r = await updateCustomerOrder({ ok: true }, form({ id: enc.id, notes: 'Sem lactose' }));
    expect(r.ok, r.message).toBe(true);
    const depois = await prisma.customerOrder.findUniqueOrThrow({ where: { id: enc.id } });
    expect(depois.notes).toBe('Sem lactose');
    expect(depois.address).toBe('Rua das Flores 1');
    expect(depois.dueAt.toISOString()).toBe('2026-10-08T12:00:00.000Z');

    // Pagamento: pago sem forma e recusado.
    const p1 = await setCustomerOrderPayment({ ok: true }, form({ id: enc.id, paid: 'on' }));
    expect(p1.ok).toBe(false);
    const p2 = await setCustomerOrderPayment({ ok: true }, form({ id: enc.id, paid: 'on', paymentMethod: 'MBWAY' }));
    expect(p2.ok, p2.message).toBe(true);
  });

  it('o consentimento so se retira com o marcador; marcado guarda a data original', async () => {
    const bolo = await produto(5);
    const n = nome('Sofia');
    await criar({
      customerName: n,
      contactConsent: 'on',
      dueAt: '2026-10-08T12:00',
      'linha.0.recipeId': bolo.id,
      'linha.0.qty': '1',
    });
    const c = await prisma.customer.findFirstOrThrow({ where: { name: n } });
    const data = c.contactConsentAt!;

    // So o telefone, sem o marcador: o consentimento fica.
    await updateCustomer({ ok: true }, form({ id: c.id, phone: '913000222' }));
    let atual = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(atual.contactConsentAt).toEqual(data);
    expect(atual.name).toBe(n);

    // Com o marcador e a caixa marcada: mantem a data de quando foi dado.
    await updateCustomer({ ok: true }, form({ id: c.id, consentSubmitted: '1', contactConsent: 'on' }));
    atual = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(atual.contactConsentAt).toEqual(data);

    // Com o marcador e a caixa desmarcada: retira.
    await updateCustomer({ ok: true }, form({ id: c.id, consentSubmitted: '1' }));
    atual = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(atual.contactConsentAt).toBeNull();
  });
});

describe('a cozinha nas encomendas', () => {
  it('muda o estado e manda para producao, mas nao cancela, nao mexe no pagamento nem apaga', async () => {
    const bolo = await produto(5);
    await criar({ customerName: nome('Ines'), dueAt: '2026-10-12T10:00', 'linha.0.recipeId': bolo.id, 'linha.0.qty': '2' });
    const enc = await prisma.customerOrder.findFirstOrThrow({ where: { lines: { some: { recipeId: bolo.id } } } });

    comoSe('KITCHEN');
    try {
      // Criar nao: o formulario e todo precos.
      const nova = await createCustomerOrder({ ok: true }, form({ customerName: nome('X'), dueAt: '2026-10-12T10:00', 'linha.0.recipeId': bolo.id, 'linha.0.qty': '1' }));
      expect(nova).toEqual({ ok: false, message: 'Sem permissao para isto.' });

      expect((await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'READY' }))).ok).toBe(true);
      const cancelar = await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'CANCELLED' }));
      expect(cancelar.ok).toBe(false);
      expect(cancelar.message).toMatch(/dono/);

      expect((await setCustomerOrderPayment({ ok: true }, form({ id: enc.id, paid: 'on', paymentMethod: 'CASH' }))).ok).toBe(false);
      expect((await deleteCustomerOrder({ ok: true }, form({ id: enc.id }))).ok).toBe(false);

      // De volta a pedida, e mandada para producao.
      expect((await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'REQUESTED' }))).ok).toBe(true);
      const f = new FormData();
      f.append('ids', enc.id);
      await expect(produceCustomerOrders({ ok: true }, f)).rejects.toThrow(/^REDIRECT \/producao\//);
    } finally {
      comoSe('OWNER');
    }

    // Uma cancelada (pelo dono) a cozinha nao a reabre.
    await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'CANCELLED' }));
    comoSe('KITCHEN');
    try {
      expect((await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'REQUESTED' }))).ok).toBe(false);
    } finally {
      comoSe('OWNER');
    }
  });

  it('a leitura nem muda o estado', async () => {
    const bolo = await produto(5);
    await criar({ customerName: nome('Rui'), dueAt: '2026-10-12T10:00', 'linha.0.recipeId': bolo.id, 'linha.0.qty': '1' });
    const enc = await prisma.customerOrder.findFirstOrThrow({ where: { lines: { some: { recipeId: bolo.id } } } });
    comoSe('READER');
    try {
      expect((await setCustomerOrderStatus({ ok: true }, form({ id: enc.id, status: 'READY' }))).ok).toBe(false);
    } finally {
      comoSe('OWNER');
    }
  });
});