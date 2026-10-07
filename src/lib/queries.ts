/**
 * Leituras do banco usadas pelas paginas (Server Components).
 * Nenhuma escrita aqui — mutacoes vivem em src/lib/actions/.
 */

import { cache } from 'react';

import { intervaloDoMes, mesAtual, mesEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import {
  buildCostContext,
  toChannelInput,
  toGlobalSettings,
  num,
} from '@/lib/mappers';
import { currencyOf } from '@/lib/money';
import type { CurrencyConfig } from '@/lib/money';
import { pagina as paginar } from '@/lib/paginacao';
import type { MovementKind } from '@/lib/pricing/stock';
import { computeRecipeCost } from '@/lib/pricing/cost';
import type { GlobalSettings } from '@/lib/pricing/channels';
import type { ChannelInput, RecipeCost } from '@/lib/pricing/types';

/**
 * Configuracoes globais. Cria a linha na primeira execucao para que a
 * aplicacao funcione logo apos o `db push`, sem passo manual.
 */
export const getSettings = cache(async () => {
  const existing = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 'default' } });
});

export async function getCurrencyConfig(): Promise<CurrencyConfig> {
  const s = await getSettings();
  return currencyOf(s);
}

/** Apenas os canais ativos — e com estes que se calculam precos. */
export const getChannels = cache(async () =>
  prisma.salesChannel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
);

/**
 * Todos os canais, ativos ou nao. Serve o ecra de configuracoes: se ele
 * usasse `getChannels`, desativar um canal fa-lo-ia desaparecer da lista e
 * nao haveria forma de o voltar a ligar.
 */
export const getAllChannels = cache(async () =>
  prisma.salesChannel.findMany({
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  }),
);

export const getIngredients = cache(async () =>
  prisma.ingredient.findMany({
    include: {
      supplier: true,
      offers: {
        where: { active: true },
        include: { supplier: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  }),
);

export const getSuppliers = cache(async () =>
  prisma.supplier.findMany({
    include: { _count: { select: { ingredients: true } } },
    orderBy: { name: 'asc' },
  }),
);

export const getRecipes = cache(async () =>
  prisma.recipe.findMany({
    include: { items: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  }),
);

/**
 * Tudo o que o motor de precificacao precisa, numa consulta so.
 *
 * Carrega o grafo inteiro de insumos e fichas de uma vez porque o custo de
 * qualquer produto pode descer por varias sub-receitas: buscar sob demanda
 * geraria uma cascata de consultas (o classico N+1) para um volume de dados
 * que cabe folgado em memoria numa lanchonete.
 */
export async function getPricingData() {
  const [settingsRow, ingredientRows, recipeRows, channelRows] = await Promise.all([
    getSettings(),
    getIngredients(),
    getRecipes(),
    getChannels(),
  ]);

  return {
    settings: toGlobalSettings(settingsRow),
    currency: currencyOf(settingsRow),
    ctx: buildCostContext(ingredientRows, recipeRows),
    channels: channelRows.map(toChannelInput),
    ingredientRows,
    recipeRows,
    settingsRow,
  };
}

export interface CostedRecipe {
  id: string;
  name: string;
  kind: 'BASE' | 'PRODUCT';
  cost: RecipeCost | null;
  /** Mensagem quando o custo nao pode ser calculado (ciclo, insumo em falta). */
  error: string | null;
  pricingMode: 'TARGET_CMV' | 'TARGET_MARGIN' | 'MANUAL';
  manualPrice: number | null;
  targetCmv: number | null;
  targetMargin: number | null;
  /** Miniatura da foto no Blob (ver `fotoSrc`). */
  photoThumbPath: string | null;
}

/**
 * Custo de todas as fichas, com os erros capturados por ficha.
 *
 * Um ciclo numa receita nao pode derrubar a listagem inteira — a ficha
 * defeituosa aparece marcada e as outras continuam a mostrar o seu custo.
 */
export async function getCostedRecipes(): Promise<{
  recipes: CostedRecipe[];
  settings: GlobalSettings;
  currency: CurrencyConfig;
  channels: ChannelInput[];
}> {
  const { ctx, settings, currency, channels, recipeRows } = await getPricingData();
  const memo = new Map<string, RecipeCost>();

  const recipes = recipeRows.map((row): CostedRecipe => {
    let cost: RecipeCost | null = null;
    let error: string | null = null;
    try {
      cost = computeRecipeCost(row.id, ctx, memo);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      cost,
      error,
      pricingMode: row.pricingMode,
      manualPrice: row.manualPrice === null ? null : num(row.manualPrice),
      targetCmv: row.targetCmv === null ? null : num(row.targetCmv),
      targetMargin: row.targetMargin === null ? null : num(row.targetMargin),
      photoThumbPath: row.photoThumbPath,
    };
  });

  return { recipes, settings, currency, channels };
}

export async function getRecipeDetail(id: string) {
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { ingredient: true, childRecipe: true },
      },
      packaging: true,
      deliveryPackaging: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Modulo 4 — producao e compras
// ---------------------------------------------------------------------------

export const getProductionOrders = cache(async () =>
  prisma.productionOrder.findMany({
    include: {
      lines: { include: { recipe: { select: { name: true } } } },
      _count: { select: { listLines: true } },
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
  }),
);

export async function getProductionOrder(id: string) {
  return prisma.productionOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: { recipe: { select: { id: true, name: true, kind: true } } },
        orderBy: { id: 'asc' },
      },
      listLines: { include: { ingredient: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Estoque e vendas
// ---------------------------------------------------------------------------

/** Insumos com saldo, custo medio e o ultimo movimento de cada um. */
export const getStockLines = cache(async () => {
  const [rows, ultimos] = await Promise.all([
    prisma.ingredient.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    prisma.stockMovement.findMany({
      distinct: ['ingredientId'],
      orderBy: { occurredAt: 'desc' },
      select: { ingredientId: true, occurredAt: true, kind: true },
    }),
  ]);

  const porInsumo = new Map(ultimos.map((m) => [m.ingredientId, m]));
  return rows.map((r) => ({ row: r, last: porInsumo.get(r.id) ?? null }));
});

/** Os filtros do livro no Estoque. Quebra e amostra juntas: ambas sao perda. */
export const FILTROS_MOVIMENTO = {
  todos: { label: 'Todos', kinds: null },
  compras: { label: 'Compras', kinds: ['PURCHASE'] },
  producao: { label: 'Producao', kinds: ['PRODUCTION'] },
  perdas: { label: 'Quebras e amostras', kinds: ['WASTE', 'PROMO'] },
  ajustes: { label: 'Ajustes e contagens', kinds: ['ADJUSTMENT', 'INVENTORY'] },
} as const satisfies Record<string, { label: string; kinds: readonly MovementKind[] | null }>;

export type FiltroMovimento = keyof typeof FILTROS_MOVIMENTO;

/**
 * Uma pagina do livro de movimentos, e quantos ha ao todo com o filtro.
 * Pagina na base: o livro so cresce, e trazer tudo para mostrar 20 nao escala.
 */
export async function getMovementsPage(pagina: number, porPagina: number, filtro: FiltroMovimento) {
  const kinds = FILTROS_MOVIMENTO[filtro].kinds;
  const where = kinds ? { kind: { in: [...kinds] } } : undefined;
  const total = await prisma.stockMovement.count({ where });
  const p = paginar(total, porPagina, pagina);
  const rows = await prisma.stockMovement.findMany({
    where,
    include: {
      ingredient: { select: { name: true, baseUnit: true } },
      order: { select: { id: true, name: true } },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    skip: p.inicio,
    take: porPagina,
  });
  return { rows, p };
}

/**
 * Soma os movimentos de um periodo por tipo.
 *
 * O periodo vem como "2026-09" e traduz-se para o intervalo do mes em UTC —
 * a mesma convencao com que as vendas sao registadas.
 */
export async function getMovementTotals(period: string) {
  const { start, end } = monthRange(period);

  const grupos = await prisma.stockMovement.groupBy({
    by: ['kind'],
    where: { occurredAt: { gte: start, lt: end } },
    _sum: { value: true },
  });

  const total = (kind: string) =>
    Math.abs(num(grupos.find((g) => g.kind === kind)?._sum.value ?? 0));

  return {
    purchase: total('PURCHASE'),
    production: total('PRODUCTION'),
    waste: total('WASTE'),
    promo: total('PROMO'),
    inventory: total('INVENTORY'),
    adjustment: total('ADJUSTMENT'),
  };
}

/** Meses com encomendas entregues. */
export async function getSalesPeriods(): Promise<string[]> {
  const entregas = await prisma.customerOrder.findMany({
    where: { status: 'DELIVERED', deliveredAt: { not: null } },
    select: { deliveredAt: true },
  });
  const meses = new Set(entregas.map((e) => mesEmLisboa(e.deliveredAt!)));
  return [...meses].sort().reverse();
}

/** "2026-09" -> [1 set 00:00, 1 out 00:00), em hora de Lisboa. Ver `lib/datas.ts`. */
export function monthRange(period: string): { start: Date; end: Date } {
  return intervaloDoMes(period);
}

/** O mes corrente em "AAAA-MM", em Lisboa. */
export function currentPeriod(): string {
  return mesAtual();
}

// ---------------------------------------------------------------------------
// Encomendas
// ---------------------------------------------------------------------------

const ENCOMENDA_LISTA = {
  customer: { select: { id: true, name: true, phone: true } },
  channel: { select: { id: true, name: true } },
  lines: {
    select: { qty: true, unitPrice: true, recipe: { select: { name: true } } },
    orderBy: { id: 'asc' },
  },
} as const;

/** Por entregar, da entrega mais proxima para a mais distante. */
export async function getOpenCustomerOrders(take?: number) {
  return prisma.customerOrder.findMany({
    where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    include: ENCOMENDA_LISTA,
    orderBy: [{ dueAt: 'asc' }, { number: 'asc' }],
    take,
  });
}

/** Entregues e canceladas, das mais recentes para tras. Pagina na base. */
export async function getClosedCustomerOrdersPage(pagina: number, porPagina: number) {
  const where = { status: { in: ['DELIVERED', 'CANCELLED'] as Array<'DELIVERED' | 'CANCELLED'> } };
  const total = await prisma.customerOrder.count({ where });
  const p = paginar(total, porPagina, pagina);
  const rows = await prisma.customerOrder.findMany({
    where,
    include: ENCOMENDA_LISTA,
    orderBy: [{ dueAt: 'desc' }, { number: 'desc' }],
    skip: p.inicio,
    take: porPagina,
  });
  return { rows, p, total };
}

export async function getCustomerOrder(id: string) {
  return prisma.customerOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      channel: true,
      productionOrder: { select: { id: true, name: true, producedAt: true } },
      lines: {
        include: { recipe: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });
}

export async function getCustomers() {
  return prisma.customer.findMany({
    select: { id: true, name: true, phone: true, contactConsentAt: true },
    orderBy: { name: 'asc' },
  });
}

/** As encomendas entregues num mes, com o que e preciso para o lucro de cada uma. */
export async function getDeliveredOrders(period: string) {
  const { start, end } = monthRange(period);
  return prisma.customerOrder.findMany({
    where: { status: 'DELIVERED', deliveredAt: { gte: start, lt: end } },
    include: { lines: true, channel: true },
  });
}

/**
 * Encomendas entregues entre dois meses (inclusive), com tudo o que o
 * relatorio cruza: linhas, canal, e o cliente com a origem e quem o indicou.
 */
export async function getDeliveredOrdersBetween(fromPeriod: string, toPeriod: string) {
  const { start } = monthRange(fromPeriod);
  const { end } = monthRange(toPeriod);
  return prisma.customerOrder.findMany({
    where: { status: 'DELIVERED', deliveredAt: { gte: start, lt: end } },
    include: {
      lines: { include: { recipe: { select: { id: true, name: true } } } },
      channel: true,
      customer: {
        select: {
          id: true,
          name: true,
          source: true,
          referredBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { deliveredAt: 'asc' },
  });
}

/** Todas as linhas entregues, com o dia — para a faturacao de cada mes. */
export async function getAllDeliveredLines() {
  const rows = await prisma.customerOrderLine.findMany({
    where: { order: { status: 'DELIVERED', deliveredAt: { not: null } } },
    select: { qty: true, unitPrice: true, order: { select: { deliveredAt: true } } },
  });
  return rows.map((r) => ({
    deliveredAt: r.order.deliveredAt!,
    qty: num(r.qty),
    unitPrice: num(r.unitPrice),
  }));
}

// ---------------------------------------------------------------------------
// Clientes e pos-venda
// ---------------------------------------------------------------------------

const ENCOMENDA_DO_CLIENTE = {
  select: {
    id: true,
    number: true,
    status: true,
    dueAt: true,
    deliveredAt: true,
    rating: true,
    feedbackAt: true,
    feedbackComment: true,
    lines: { select: { qty: true, unitPrice: true, recipe: { select: { name: true } } } },
  },
  orderBy: { dueAt: 'desc' },
} as const;

/** Todos os clientes, com as encomendas resumidas para as contas da lista. */
export async function getCustomersWithOrders() {
  return prisma.customer.findMany({
    include: {
      referredBy: { select: { id: true, name: true } },
      _count: { select: { referrals: true } },
      orders: ENCOMENDA_DO_CLIENTE,
    },
    orderBy: { name: 'asc' },
  });
}

export async function getCustomerDetail(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      referredBy: { select: { id: true, name: true } },
      referrals: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      orders: ENCOMENDA_DO_CLIENTE,
      reminders: { orderBy: [{ doneAt: 'asc' }, { dueAt: 'asc' }] },
    },
  });
}

/**
 * Pos-vendas por fazer: entregues, sem resposta, com dia marcado, e de quem
 * aceitou ser contactado. A condicao do consentimento repete-se aqui de
 * proposito — se alguem o retirar por um caminho que nao limpe o dia
 * marcado, a lista continua a nao lhe escrever.
 */
export async function getPendingFollowUps() {
  return prisma.customerOrder.findMany({
    where: {
      status: 'DELIVERED',
      feedbackAt: null,
      followUpDueAt: { not: null },
      customer: { contactConsentAt: { not: null } },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      lines: {
        select: { id: true, qty: true, recipe: { select: { name: true } } },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { followUpDueAt: 'asc' },
  });
}

/** As ultimas opinioes registadas. */
export async function getRecentFeedback(take: number) {
  return prisma.customerOrder.findMany({
    where: { feedbackAt: { not: null } },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { select: { qty: true, rating: true, recipe: { select: { name: true } } } },
    },
    orderBy: { feedbackAt: 'desc' },
    take,
  });
}

export async function getOpenReminders() {
  return prisma.reminder.findMany({
    where: { doneAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
    },
    orderBy: { dueAt: 'asc' },
  });
}

export async function getRecentlyDoneReminders(take: number) {
  return prisma.reminder.findMany({
    where: { doneAt: { not: null } },
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
    },
    orderBy: { doneAt: 'desc' },
    take,
  });
}

/** Clientes com aniversario e consentimento — so a esses se pode escrever. */
export async function getBirthdayCustomers() {
  return prisma.customer.findMany({
    where: {
      birthDay: { not: null },
      birthMonth: { not: null },
      contactConsentAt: { not: null },
    },
    select: { id: true, name: true, phone: true, birthDay: true, birthMonth: true },
  });
}

/** Linhas com nota (ou numa encomenda com nota), para a media por produto. */
export async function getRatedLines() {
  const rows = await prisma.customerOrderLine.findMany({
    where: { OR: [{ rating: { not: null } }, { order: { rating: { not: null } } }] },
    select: {
      recipeId: true,
      rating: true,
      order: { select: { rating: true, _count: { select: { lines: true } } } },
    },
  });
  return rows.map((r) => ({
    recipeId: r.recipeId,
    rating: r.rating,
    orderRating: r.order.rating,
    linesInOrder: r.order._count.lines,
  }));
}

export async function getQuotes(ingredientId: string) {
  return prisma.priceQuote.findMany({
    where: { ingredientId },
    orderBy: { capturedAt: 'desc' },
    take: 20,
  });
}
