/**
 * Leituras do banco usadas pelas paginas (Server Components).
 * Nenhuma escrita aqui — mutacoes vivem em src/lib/actions/.
 */

import { cache } from 'react';

import { prisma } from '@/lib/db';
import {
  buildCostContext,
  toChannelInput,
  toGlobalSettings,
  num,
} from '@/lib/mappers';
import type { CurrencyConfig } from '@/lib/money';
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
  return { currency: s.currency, locale: s.locale };
}

export const getChannels = cache(async () =>
  prisma.salesChannel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
);

export const getIngredients = cache(async () =>
  prisma.ingredient.findMany({
    include: { supplier: true },
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
    currency: { currency: settingsRow.currency, locale: settingsRow.locale },
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

export async function getQuotes(ingredientId: string) {
  return prisma.priceQuote.findMany({
    where: { ingredientId },
    orderBy: { capturedAt: 'desc' },
    take: 20,
  });
}
