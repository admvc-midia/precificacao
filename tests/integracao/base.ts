/**
 * Andaime dos testes que falam com a base de dados a serio.
 *
 * ---------------------------------------------------------------------------
 * PORQUE ISTO E MAIS PARANOICO DO QUE O NORMAL
 * ---------------------------------------------------------------------------
 * Nao ha base de testes separada: estes correm contra a mesma base que a casa
 * usa, que por sua vez partilha o servidor com outro projeto. Em troca da
 * conveniencia, tudo o que aqui se escreve tem de ser reversivel e provado
 * como tal.
 *
 * A razao nao e teorica. A configuracao desta casa ja foi zerada uma vez por
 * um pedido de diagnostico — o IVA, os custos fixos, a taxa de cartao e a
 * margem alvo foram todos a zero, sem erro nenhum, porque zero e um valor
 * legitimo em todos eles. Ninguem reparou ate os precos sugeridos comecarem a
 * ignorar impostos.
 *
 * Tres defesas, por ordem de importancia:
 *
 *  1. **Nada se cria sem a marca.** Todas as linhas levam `ZZTEMP-` no nome, e
 *     a limpeza apaga so por essa marca. O que nao tem marca nao e tocado.
 *  2. **A configuracao e um singleton**, nao se pode marcar, e por isso
 *     fotografa-se antes e repoe-se depois — campo a campo, com verificacao.
 *     Se a reposicao nao bater, o teste falha e diz o que ficou diferente.
 *  3. **Conta-se o que e do utilizador antes e depois.** Se um numero mudar,
 *     falha. E a rede que apanha o que as outras duas nao previram.
 */

import { expect } from 'vitest';

import type { RoundingStrategy, VatMode } from '@prisma/client';

import { prisma } from '@/lib/db';

/** Prefixo de tudo o que estes testes criam. */
export const MARCA = 'ZZTEMP-';

/** Nome unico e marcado, para dois testes nao colidirem. */
export function nome(base: string): string {
  return `${MARCA}${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Recusa-se a correr contra uma base que nao seja a desta aplicacao.
 *
 * Sem `schema=precificaragao` o Prisma trabalha no `public`, que aqui e de
 * outro projeto. Um teste que apague linhas la seria um estrago em dados que
 * nem sequer sao deste produto.
 */
export function exigirSchemaCerto(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL nao esta definida.');
  if (!/[?&]schema=precificaragao(\b|&|$)/.test(url)) {
    throw new Error(
      'DATABASE_URL nao aponta ao schema `precificaragao`. Estes testes escrevem ' +
        'na base; correr no schema errado mexeria noutro projeto.',
    );
  }
}

/** Os numeros do utilizador, para comparar no fim. */
export interface Retrato {
  insumos: number;
  fornecedores: number;
  fichas: number;
  linhasDeFicha: number;
  despesas: number;
  movimentos: number;
  vendas: number;
  ofertas: number;
  canais: number;
  listasDeCompras: number;
  itensDeCompras: number;
  settings: Record<string, unknown>;
}

/** Conta so o que **nao** tem a marca: os dados a serio. */
export async function retrato(): Promise<Retrato> {
  const semMarca = { name: { not: { startsWith: MARCA } } };

  const s = await prisma.settings.findUniqueOrThrow({ where: { id: 'default' } });

  return {
    insumos: await prisma.ingredient.count({ where: semMarca }),
    fornecedores: await prisma.supplier.count({ where: semMarca }),
    fichas: await prisma.recipe.count({ where: semMarca }),
    linhasDeFicha: await prisma.recipeItem.count({
      where: { recipe: semMarca },
    }),
    despesas: await prisma.expense.count({ where: semMarca }),
    movimentos: await prisma.stockMovement.count({
      where: { ingredient: semMarca },
    }),
    vendas: await prisma.salesRecord.count({ where: { recipe: semMarca } }),
    ofertas: await prisma.supplierOffer.count({
      where: { ingredient: semMarca },
    }),
    canais: await prisma.salesChannel.count(),
    listasDeCompras: await prisma.shoppingList.count({
      where: { NOT: { name: { startsWith: MARCA } } },
    }),
    itensDeCompras: await prisma.shoppingItem.count({ where: { ingredient: semMarca } }),
    settings: {
      businessName: s.businessName,
      currency: s.currency,
      locale: s.locale,
      vatRate: String(s.vatRate),
      vatMode: s.vatMode,
      fixedCostRate: String(s.fixedCostRate),
      cardFeeRate: String(s.cardFeeRate),
      targetCmv: String(s.targetCmv),
      targetMargin: String(s.targetMargin),
      rounding: s.rounding,
      displayDecimals: s.displayDecimals,
      expectedMonthlyRevenue:
        s.expectedMonthlyRevenue === null ? null : String(s.expectedMonthlyRevenue),
    },
  };
}

/**
 * Repoe a configuracao a partir do retrato.
 *
 * Passa-se sempre, mesmo que o teste diga que nao lhe tocou: repor o que ja
 * esta certo nao custa nada, e o caso que interessa e precisamente aquele em
 * que alguem mexeu sem dar por isso.
 */
export async function reporSettings(r: Retrato): Promise<void> {
  const s = r.settings;
  await prisma.settings.update({
    where: { id: 'default' },
    data: {
      businessName: s.businessName as string | null,
      currency: s.currency as string,
      locale: s.locale as string,
      vatRate: s.vatRate as string,
      vatMode: s.vatMode as VatMode,
      fixedCostRate: s.fixedCostRate as string,
      cardFeeRate: s.cardFeeRate as string,
      targetCmv: s.targetCmv as string,
      targetMargin: s.targetMargin as string,
      rounding: s.rounding as RoundingStrategy,
      displayDecimals: s.displayDecimals as number,
      expectedMonthlyRevenue: s.expectedMonthlyRevenue as string | null,
    },
  });
}

/** Apaga tudo o que leva a marca, filhos antes dos pais. */
export async function limpar(): Promise<void> {
  const insumos = (
    await prisma.ingredient.findMany({
      where: { name: { startsWith: MARCA } },
      select: { id: true },
    })
  ).map((i) => i.id);

  const fichas = (
    await prisma.recipe.findMany({
      where: { name: { startsWith: MARCA } },
      select: { id: true },
    })
  ).map((r) => r.id);

  // Listas de compras: as marcadas inteiras, e itens de insumos marcados que
  // um teste tenha posto numa lista do utilizador.
  await prisma.shoppingList.deleteMany({ where: { name: { startsWith: MARCA } } });
  await prisma.shoppingItem.deleteMany({ where: { ingredientId: { in: insumos } } });
  await prisma.salesRecord.deleteMany({ where: { recipeId: { in: fichas } } });
  await prisma.recipeItem.deleteMany({
    where: {
      OR: [{ recipeId: { in: fichas } }, { ingredientId: { in: insumos } }],
    },
  });
  await prisma.productionOrderLine.deleteMany({
    where: { OR: [{ recipeId: { in: fichas } }] },
  });
  // Ordens marcadas inteiras (as linhas vao em cascata).
  await prisma.productionOrder.deleteMany({ where: { name: { startsWith: MARCA } } });
  await prisma.recipe.deleteMany({ where: { id: { in: fichas } } });
  await prisma.stockMovement.deleteMany({ where: { ingredientId: { in: insumos } } });
  await prisma.purchaseListLine.deleteMany({
    where: { ingredientId: { in: insumos } },
  });
  await prisma.priceQuote.deleteMany({ where: { ingredientId: { in: insumos } } });
  await prisma.supplierOffer.deleteMany({ where: { ingredientId: { in: insumos } } });
  await prisma.ingredient.deleteMany({ where: { id: { in: insumos } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: MARCA } } });
  await prisma.expense.deleteMany({ where: { name: { startsWith: MARCA } } });
}

/**
 * Prova que nada do utilizador mudou.
 *
 * Chamado no fim de cada ficheiro. Se falhar, ha uma linha a mais, a menos, ou
 * uma configuracao diferente — e e melhor um teste vermelho do que um estrago
 * silencioso.
 */
export async function exigirTudoComoEstava(antes: Retrato): Promise<void> {
  const depois = await retrato();
  expect(depois).toEqual(antes);
}

/** Um `FormData` a partir de um objecto, que e o que as actions recebem. */
export function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

export { prisma };
