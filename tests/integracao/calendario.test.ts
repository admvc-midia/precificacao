/**
 * Calendario de producao contra a base de testes: eventos do dono, plano numa
 * data conhecida (a linha nasce na primeira vez), como correu, e so o dono
 * escreve.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));

import {
  alterarEvento,
  apagarEvento,
  criarEvento,
  guardarPlano,
  guardarRevisao,
  tirarDoPlano,
} from '@/lib/actions/calendario';
import { eventosDoIntervalo, vendasNosDias } from '@/lib/calendario/consultas';
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
import { comoSe } from './sessao-falsa';

let antes: Retrato;
/** A data conhecida usada aqui; a linha dela e apagada no fim, se o teste a criou. */
const CHAVE = 'criancas-br';
let jaHavia = false;

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
  jaHavia = (await prisma.calendarEvent.count({ where: { knownKey: CHAVE } })) > 0;
});

afterAll(async () => {
  comoSe('OWNER');
  if (!jaHavia) await prisma.calendarEvent.deleteMany({ where: { knownKey: CHAVE } });
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

beforeEach(() => comoSe('OWNER'));

async function ficha() {
  return prisma.recipe.create({ data: { name: nome('Bolo de pote'), kind: 'PRODUCT', yieldQty: 1 } });
}

describe('calendario', () => {
  it('plano numa data conhecida: a linha nasce na primeira vez e serve todos os anos', async () => {
    const f = await ficha();
    const r = await guardarPlano({ ok: true }, form({ chave: CHAVE, recipeId: f.id, action: 'NONE', qty: '12', note: 'nao vende' }));
    expect(r.ok, r.message).toBe(true);

    const linha = await prisma.calendarEvent.findUniqueOrThrow({ where: { knownKey: CHAVE }, include: { plans: true } });
    expect(linha.day).toBeNull();
    // "Nao produzir" nao leva quantidade.
    expect(linha.plans.find((p) => p.recipeId === f.id)).toMatchObject({ action: 'NONE', qty: null, note: 'nao vende' });

    for (const [ini, fim, dia] of [['2026-10-01', '2026-10-31', '2026-10-12'], ['2027-10-01', '2027-10-31', '2027-10-12']]) {
      const o = (await eventosDoIntervalo(ini, fim)).find((x) => x.chave === CHAVE)!;
      expect(o.dia).toBe(dia);
      expect(o.planos.map((p) => p.produto)).toContain(f.name);
    }

    // Guardar outra vez o mesmo produto muda a linha, nao junta outra.
    await guardarPlano({ ok: true }, form({ chave: CHAVE, recipeId: f.id, action: 'MORE', qty: '30', note: '' }));
    const planos = await prisma.calendarPlanItem.findMany({ where: { recipeId: f.id } });
    expect(planos).toHaveLength(1);
    expect(planos[0]).toMatchObject({ action: 'MORE', qty: 30, note: null });

    expect((await tirarDoPlano({ ok: true }, form({ id: planos[0].id }))).ok).toBe(true);
    expect(await prisma.calendarPlanItem.count({ where: { recipeId: f.id } })).toBe(0);
  });

  it('evento do dono: criar, alterar, como correu, apagar', async () => {
    const titulo = nome('Feira');
    const c = await criarEvento({ ok: true }, form({ title: titulo, day: '2026-11-14', kind: 'EVENT', yearly: 'on', notes: 'banca de brigadeiros' }));
    expect(c.ok, c.message).toBe(true);
    const e = await prisma.calendarEvent.findFirstOrThrow({ where: { title: titulo } });
    expect(e).toMatchObject({ yearly: true, kind: 'EVENT', notes: 'banca de brigadeiros' });
    expect(e.day?.toISOString().slice(0, 10)).toBe('2026-11-14');

    const a = await alterarEvento({ ok: true }, form({ eventoId: e.id, title: titulo, day: '2026-11-21', kind: 'TREND', notes: '' }));
    expect(a.ok, a.message).toBe(true);
    const depois = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(depois).toMatchObject({ yearly: false, kind: 'TREND', notes: null });

    expect((await guardarRevisao({ ok: true }, form({ eventoId: e.id, ano: '2026', text: 'esgotou ao meio-dia' }))).ok).toBe(true);
    await guardarRevisao({ ok: true }, form({ eventoId: e.id, ano: '2026', text: 'esgotou as 11h' }));
    expect(await prisma.calendarReview.findMany({ where: { eventId: e.id } })).toMatchObject([{ year: 2026, text: 'esgotou as 11h' }]);
    // Vazio apaga.
    await guardarRevisao({ ok: true }, form({ eventoId: e.id, ano: '2026', text: '' }));
    expect(await prisma.calendarReview.count({ where: { eventId: e.id } })).toBe(0);

    expect((await apagarEvento({ ok: true }, form({ eventoId: e.id }))).ok).toBe(true);
    expect(await prisma.calendarEvent.findUnique({ where: { id: e.id } })).toBeNull();
  });

  it('recusa dia invalido, nome vazio, data conhecida inventada e apagar uma data conhecida', async () => {
    expect((await criarEvento({ ok: true }, form({ title: nome('X'), day: '14/11/2026', kind: 'EVENT' }))).ok).toBe(false);
    expect((await criarEvento({ ok: true }, form({ title: '  ', day: '2026-11-14', kind: 'EVENT' }))).ok).toBe(false);
    const f = await ficha();
    expect((await guardarPlano({ ok: true }, form({ chave: 'dia-inventado', recipeId: f.id, action: 'MORE' }))).ok).toBe(false);
    await guardarRevisao({ ok: true }, form({ chave: CHAVE, ano: '2025', text: 'teste' }));
    const linha = await prisma.calendarEvent.findUniqueOrThrow({ where: { knownKey: CHAVE } });
    const r = await apagarEvento({ ok: true }, form({ eventoId: linha.id }));
    expect(r.ok).toBe(false);
    await guardarRevisao({ ok: true }, form({ chave: CHAVE, ano: '2025', text: '' }));
  });

  it('a cozinha e a leitura nao escrevem no calendario', async () => {
    const f = await ficha();
    const titulo = nome('Folga');
    for (const perfil of ['KITCHEN', 'READER'] as const) {
      comoSe(perfil, `zztemp-${perfil}`);
      expect((await criarEvento({ ok: true }, form({ title: titulo, day: '2026-11-14', kind: 'TEAM' }))).ok).toBe(false);
      expect((await guardarPlano({ ok: true }, form({ chave: CHAVE, recipeId: f.id, action: 'NONE' }))).ok).toBe(false);
      expect((await guardarRevisao({ ok: true }, form({ chave: CHAVE, ano: '2026', text: 'x' }))).ok).toBe(false);
    }
    expect(await prisma.calendarEvent.count({ where: { title: titulo } })).toBe(0);
    expect(await prisma.calendarPlanItem.count({ where: { recipeId: f.id } })).toBe(0);
  });

  it('vendas por dia: conta as do dia, sem as canceladas', async () => {
    const f = await ficha();
    const cliente = await prisma.customer.create({ data: { name: nome('Cliente') } });
    const linha = {
      create: [{ recipeId: f.id, qty: 3, unitPrice: 2, unitFoodCost: 1, unitPackagingCost: 0, unitDeliveryPackagingCost: 0 }],
    };
    await prisma.customerOrder.create({ data: { customerId: cliente.id, dueAt: new Date('2026-10-12T15:00:00Z'), lines: linha } });
    await prisma.customerOrder.create({ data: { customerId: cliente.id, dueAt: new Date('2026-10-12T23:30:00Z'), lines: linha } });
    await prisma.customerOrder.create({ data: { customerId: cliente.id, dueAt: new Date('2026-10-12T10:00:00Z'), status: 'CANCELLED', lines: linha } });
    await prisma.customerOrder.create({ data: { customerId: cliente.id, dueAt: new Date('2026-10-13T00:30:00Z'), lines: linha } });

    const v = await vendasNosDias(['2026-10-12']);
    const doDia = v.get('2026-10-12')!;
    // Pode haver outras encomendas de teste nesse dia; as nossas sao 2, com 3 cada.
    expect(doDia.encomendas).toBeGreaterThanOrEqual(2);
    expect(doDia.produtos.find((p) => p.nome === f.name)?.qtd).toBe(6);
  });
});
