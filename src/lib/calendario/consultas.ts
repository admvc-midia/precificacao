/**
 * O que o calendario le da base: os eventos do dono (com plano e notas) e o
 * que se vendeu em certos dias.
 */

import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { somarDias } from './datas';
import { eventosEntre, type Ocorrencia, type Registo } from './eventos';

/** Todos os eventos: sao poucos (um por data marcada), e o calendario precisa de todos os anuais. */
export async function lerRegistos(): Promise<Registo[]> {
  const linhas = await prisma.calendarEvent.findMany({
    include: {
      plans: { include: { recipe: { select: { name: true } } }, orderBy: { recipe: { name: 'asc' } } },
      reviews: { orderBy: { year: 'desc' } },
    },
  });
  return linhas.map((e) => ({
    id: e.id,
    knownKey: e.knownKey,
    title: e.title,
    day: e.day ? e.day.toISOString().slice(0, 10) : null,
    yearly: e.yearly,
    kind: e.kind,
    notes: e.notes,
    planos: e.plans.map((p) => ({
      id: p.id,
      recipeId: p.recipeId,
      produto: p.recipe.name,
      acao: p.action,
      qty: p.qty,
      nota: p.note,
    })),
    revisoes: e.reviews.map((r) => ({ ano: r.year, texto: r.text })),
  }));
}

export async function eventosDoIntervalo(inicio: string, fim: string): Promise<Ocorrencia[]> {
  return eventosEntre(inicio, fim, await lerRegistos());
}

export interface VendasDoDia {
  encomendas: number;
  /** Os mais pedidos, por quantidade. */
  produtos: Array<{ nome: string; qtd: number }>;
}

/**
 * Encomendas para entregar em cada um destes dias (as canceladas nao contam).
 * O `dueAt` e a hora de Lisboa guardada como UTC: o dia e o da data UTC.
 */
export async function vendasNosDias(dias: string[]): Promise<Map<string, VendasDoDia>> {
  const out = new Map<string, VendasDoDia>();
  if (dias.length === 0) return out;
  const ordenados = [...new Set(dias)].sort();
  const encomendas = await prisma.customerOrder.findMany({
    where: {
      status: { not: 'CANCELLED' },
      dueAt: {
        gte: new Date(`${ordenados[0]}T00:00:00Z`),
        lt: new Date(`${somarDias(ordenados[ordenados.length - 1], 1)}T00:00:00Z`),
      },
    },
    select: { dueAt: true, lines: { select: { qty: true, recipe: { select: { name: true } } } } },
  });
  const pedidos = new Set(ordenados);
  const porDia = new Map<string, { n: number; qtd: Map<string, number> }>();
  for (const e of encomendas) {
    const dia = e.dueAt.toISOString().slice(0, 10);
    if (!pedidos.has(dia)) continue;
    const d = porDia.get(dia) ?? { n: 0, qtd: new Map() };
    d.n++;
    for (const l of e.lines) d.qtd.set(l.recipe.name, (d.qtd.get(l.recipe.name) ?? 0) + num(l.qty));
    porDia.set(dia, d);
  }
  for (const [dia, d] of porDia) {
    out.set(dia, {
      encomendas: d.n,
      produtos: [...d.qtd].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 3),
    });
  }
  return out;
}

/** Os produtos que podem entrar num plano: as fichas de produto. */
export async function produtosParaPlano(): Promise<Array<{ id: string; nome: string }>> {
  const r = await prisma.recipe.findMany({ where: { kind: 'PRODUCT' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return r.map((p) => ({ id: p.id, nome: p.name }));
}
