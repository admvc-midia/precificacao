/**
 * Clientes, pos-venda e lembretes contra a base a serio.
 *
 * O que mais importa provar: o pos-venda so se agenda para quem deu
 * consentimento, e retirar o consentimento tira-o da lista.
 *
 * Tudo marcado com ZZTEMP- e apagado no fim.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { createCustomer, updateCustomer } from '@/lib/actions/clientes';
import { createCustomerOrder, setCustomerOrderStatus } from '@/lib/actions/encomendas';
import {
  createReminder,
  deleteReminder,
  registerFeedback,
  registerNoAnswer,
  toggleReminder,
} from '@/lib/actions/posvenda';
import { getPendingFollowUps, getRatedLines } from '@/lib/queries';
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

/** Uma encomenda entregue, de um cliente marcado com ou sem consentimento. */
async function entregue(consentimento: boolean, linhas = 1) {
  const bolo = await produto();
  const outro = linhas > 1 ? await produto() : null;
  const cliente = nome('Cliente');
  const campos: Record<string, string> = {
    customerName: cliente,
    // Um telefone por cliente: com o mesmo, a app reconhece-os como um so.
    customerPhone: `91${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    dueAt: '2026-10-08T15:00',
    'linha.0.recipeId': bolo.id,
    'linha.0.qty': '1',
  };
  if (consentimento) campos.contactConsent = 'on';
  if (outro) {
    campos['linha.1.recipeId'] = outro.id;
    campos['linha.1.qty'] = '2';
  }
  await expect(createCustomerOrder({ ok: true }, form(campos))).rejects.toThrow(/^REDIRECT/);
  const c = await prisma.customer.findFirstOrThrow({ where: { name: cliente } });
  const e = await prisma.customerOrder.findFirstOrThrow({
    where: { customerId: c.id },
    include: { lines: true },
  });
  const r = await setCustomerOrderStatus({ ok: true }, form({ id: e.id, status: 'DELIVERED' }));
  expect(r.ok, r.message).toBe(true);
  return {
    cliente: c,
    encomenda: await prisma.customerOrder.findUniqueOrThrow({
      where: { id: e.id },
      include: { lines: true },
    }),
  };
}

describe('pos-venda', () => {
  it('entregar agenda o pos-venda N dias depois, so com consentimento', async () => {
    const dias = (await prisma.settings.findUniqueOrThrow({ where: { id: 'default' } })).followUpDays;

    const { encomenda: com } = await entregue(true);
    expect(com.followUpDueAt!.getTime() - com.deliveredAt!.getTime()).toBe(dias * 86_400_000);

    const { encomenda: sem } = await entregue(false);
    expect(sem.followUpDueAt).toBeNull();
    expect((await getPendingFollowUps()).some((e) => e.id === sem.id)).toBe(false);

    // Voltar atras desfaz o agendamento.
    await setCustomerOrderStatus({ ok: true }, form({ id: com.id, status: 'READY' }));
    expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: com.id } })).followUpDueAt).toBeNull();
  });

  it('registar a opiniao fecha o pos-venda e alimenta a nota do produto', async () => {
    const { encomenda } = await entregue(true, 2);
    const [l1, l2] = encomenda.lines;

    const semNota = await registerFeedback(
      { ok: true },
      form({ orderId: encomenda.id, via: 'WHATSAPP' }),
    );
    expect(semNota.ok).toBe(false);

    const r = await registerFeedback(
      { ok: true },
      form({
        orderId: encomenda.id,
        via: 'WHATSAPP',
        rating: '4',
        [`nota:${l1.id}`]: '5',
        [`nota:${l2.id}`]: '',
        comment: 'Muito bom',
      }),
    );
    expect(r.ok, r.message).toBe(true);

    const depois = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: encomenda.id },
      include: { lines: true },
    });
    expect(depois.feedbackAt).not.toBeNull();
    expect(depois.followUpDueAt).toBeNull();
    expect(depois.rating).toBe(4);
    expect(depois.feedbackComment).toBe('Muito bom');
    expect(depois.lines.find((l) => l.id === l1.id)!.rating).toBe(5);
    expect(depois.lines.find((l) => l.id === l2.id)!.rating).toBeNull();

    expect((await getPendingFollowUps()).some((e) => e.id === encomenda.id)).toBe(false);
    expect((await getRatedLines()).some((l) => l.recipeId === l1.recipeId && l.rating === 5)).toBe(true);

    // Uma nota de um produto de outra encomenda e recusada.
    const fora = await registerFeedback(
      { ok: true },
      form({ orderId: encomenda.id, via: 'PHONE', rating: '3', 'nota:outra-linha': '2' }),
    );
    expect(fora.ok).toBe(false);
  });

  it('nao atendeu passa para amanha e conta a tentativa', async () => {
    const { encomenda } = await entregue(true);
    const antesDe = Date.now();
    expect((await registerNoAnswer({ ok: true }, form({ orderId: encomenda.id }))).ok).toBe(true);
    const e = await prisma.customerOrder.findUniqueOrThrow({ where: { id: encomenda.id } });
    expect(e.followUpAttempts).toBe(1);
    expect(e.followUpDueAt!.getTime()).toBeGreaterThanOrEqual(antesDe + 86_400_000 - 1000);
  });

  it('retirar o consentimento tira o cliente da lista', async () => {
    const { cliente, encomenda } = await entregue(true);
    expect((await getPendingFollowUps()).some((e) => e.id === encomenda.id)).toBe(true);

    const r = await updateCustomer({ ok: true }, form({ id: cliente.id, consentSubmitted: '1' }));
    expect(r.ok, r.message).toBe(true);

    const e = await prisma.customerOrder.findUniqueOrThrow({ where: { id: encomenda.id } });
    expect(e.followUpDueAt).toBeNull();
    expect((await getPendingFollowUps()).some((x) => x.id === encomenda.id)).toBe(false);
  });
});

describe('clientes', () => {
  it('cria, le o aniversario, recusa disparates, e nao apaga o que nao veio', async () => {
    const n = nome('Joana');
    await expect(
      createCustomer(
        { ok: true },
        form({ name: n, phone: '911', birthday: '29/2', source: 'INSTAGRAM', contactConsent: 'on' }),
      ),
    ).rejects.toThrow(/^REDIRECT \/clientes\//);
    const c = await prisma.customer.findFirstOrThrow({ where: { name: n } });
    expect([c.birthDay, c.birthMonth, c.source]).toEqual([29, 2, 'INSTAGRAM']);
    expect(c.contactConsentAt).not.toBeNull();

    expect((await updateCustomer({ ok: true }, form({ id: c.id, birthday: '31/4' }))).ok).toBe(false);
    expect((await updateCustomer({ ok: true }, form({ id: c.id, referredById: c.id }))).ok).toBe(false);

    // So os gostos: o resto fica.
    const r = await updateCustomer({ ok: true }, form({ id: c.id, likes: 'Chocolate' }));
    expect(r.ok, r.message).toBe(true);
    const depois = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(depois.likes).toBe('Chocolate');
    expect(depois.phone).toBe('911');
    expect(depois.birthDay).toBe(29);
    expect(depois.contactConsentAt).toEqual(c.contactConsentAt);
  });

  it('nova encomenda de um cliente novo guarda a origem e quem indicou', async () => {
    const bolo = await produto();
    const quem = await prisma.customer.create({ data: { name: nome('Indicadora') } });
    const n = nome('Indicado');
    await expect(
      createCustomerOrder(
        { ok: true },
        form({
          customerName: n,
          customerSource: 'REFERRAL',
          referredById: quem.id,
          dueAt: '2026-10-08T15:00',
          'linha.0.recipeId': bolo.id,
          'linha.0.qty': '1',
        }),
      ),
    ).rejects.toThrow(/^REDIRECT/);
    const c = await prisma.customer.findFirstOrThrow({ where: { name: n } });
    expect([c.source, c.referredById]).toEqual(['REFERRAL', quem.id]);
  });
});

describe('lembretes', () => {
  it('cria, marca como feito, desmarca e apaga', async () => {
    const c = await prisma.customer.create({ data: { name: nome('Rui') } });

    expect((await createReminder({ ok: true }, form({ title: '', dueAt: '2026-10-10' }))).ok).toBe(false);
    expect((await createReminder({ ok: true }, form({ title: 'Ligar', dueAt: '' }))).ok).toBe(false);

    const r = await createReminder(
      { ok: true },
      form({ title: 'Ligar sobre o casamento', dueAt: '2026-10-10', customerId: c.id }),
    );
    expect(r.ok, r.message).toBe(true);
    const l = await prisma.reminder.findFirstOrThrow({ where: { customerId: c.id } });
    expect(l.dueAt.toISOString()).toBe('2026-10-10T00:00:00.000Z');

    await toggleReminder({ ok: true }, form({ id: l.id }));
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: l.id } })).doneAt).not.toBeNull();
    await toggleReminder({ ok: true }, form({ id: l.id }));
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: l.id } })).doneAt).toBeNull();

    await deleteReminder({ ok: true }, form({ id: l.id }));
    expect(await prisma.reminder.findUnique({ where: { id: l.id } })).toBeNull();
  });
});
