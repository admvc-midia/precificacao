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

import type { RoundingStrategy, VatMode } from '@/generated/prisma/client';

import { prisma, tabela } from '@/lib/db';

/** Prefixo de tudo o que estes testes criam. */
export const MARCA = 'ZZTEMP-';

/** Nome unico e marcado, para dois testes nao colidirem. */
export function nome(base: string): string {
  return `${MARCA}${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Recusa-se a correr fora do schema dos testes.
 *
 * Os testes escrevem e apagam. No `public` mexeriam no outro projeto; no
 * `precificaragao`, nos dados da casa. So o `precificaragao_teste` serve —
 * e o `base-de-testes.ts` que para la aponta a ligacao, antes de tudo.
 */
export function exigirSchemaCerto(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL nao esta definida.');
  if (!/[?&]schema=precificaragao_teste(&|$)/.test(url)) {
    throw new Error(
      'DATABASE_URL nao aponta ao schema `precificaragao_teste`. Estes testes escrevem ' +
        'na base; correr noutro schema mexeria nos dados da casa ou noutro projeto.',
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
  ofertas: number;
  canais: number;
  listasDeCompras: number;
  itensDeCompras: number;
  clientes: number;
  encomendas: number;
  ordensDeProducao: number;
  lembretes: number;
  utilizadores: number;
  receitasDoLivro: number;
  versoesDoLivro: number;
  livros: number;
  secoesDoCardapio: number;
  itensDoCardapio: number;
  promocoes: number;
  cupoes: number;
  campanhas: number;
  tarefas: number;
  guia: number;
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
    ofertas: await prisma.supplierOffer.count({
      where: { ingredient: semMarca },
    }),
    canais: await prisma.salesChannel.count(),
    listasDeCompras: await prisma.shoppingList.count({
      where: { NOT: { name: { startsWith: MARCA } } },
    }),
    itensDeCompras: await prisma.shoppingItem.count({ where: { ingredient: semMarca } }),
    clientes: await prisma.customer.count({ where: semMarca }),
    // Encomenda sem cliente conta como do utilizador: os testes poem sempre um marcado.
    encomendas: await prisma.customerOrder.count({
      where: { NOT: { customer: { name: { startsWith: MARCA } } } },
    }),
    // As ordens criadas a partir de encomendas tem nome de data, nao a marca.
    ordensDeProducao: await prisma.productionOrder.count({
      where: {
        NOT: [
          { name: { startsWith: MARCA } },
          { customerOrders: { some: { customer: { name: { startsWith: MARCA } } } } },
        ],
      },
    }),
    // Lembretes sem cliente contam como do utilizador: os testes ligam-nos sempre a um marcado.
    lembretes: await prisma.reminder.count({
      where: { NOT: { customer: { name: { startsWith: MARCA } } } },
    }),
    // Contas de teste comecam por "zztemp-" (os nomes de utilizador sao minusculas).
    utilizadores: await prisma.user.count({
      where: { NOT: { username: { startsWith: MARCA.toLowerCase() } } },
    }),
    receitasDoLivro: await prisma.bookRecipe.count({ where: { NOT: { title: { startsWith: MARCA } } } }),
    versoesDoLivro: await prisma.bookRecipeVersion.count({
      where: { NOT: { recipe: { title: { startsWith: MARCA } } } },
    }),
    livros: await prisma.cookbook.count({ where: { NOT: { title: { startsWith: MARCA } } } }),
    secoesDoCardapio: await prisma.menuSection.count({ where: semMarca }),
    // Itens marcados pelo nome, ou ligados a uma ficha marcada.
    itensDoCardapio: await prisma.menuItem.count({
      where: { NOT: [{ name: { startsWith: MARCA } }, { recipe: { name: { startsWith: MARCA } } }] },
    }),
    promocoes: await prisma.promotion.count({ where: semMarca }),
    // Os codigos dos cupoes sao maiusculas: "ZZTEMP-...".
    cupoes: await prisma.coupon.count({ where: { NOT: { code: { startsWith: MARCA } } } }),
    campanhas: await prisma.campaign.count({ where: { NOT: { title: { startsWith: MARCA } } } }),
    tarefas: await prisma.campaignTask.count({ where: { NOT: { campaign: { title: { startsWith: MARCA } } } } }),
    guia: await prisma.marketingGuideSection.count({ where: { NOT: { title: { startsWith: MARCA } } } }),
    settings: {
      businessName: s.businessName,
      followUpDays: s.followUpDays,
      followUpMessage: s.followUpMessage,
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
      whatsappNumber: s.whatsappNumber,
      instagramHandle: s.instagramHandle,
      facebookHandle: s.facebookHandle,
      menuIntro: s.menuIntro,
      menuPublished: s.menuPublished,
      googleReviewUrl: s.googleReviewUrl,
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
      followUpDays: s.followUpDays as number,
      followUpMessage: s.followUpMessage as string | null,
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
      whatsappNumber: s.whatsappNumber as string | null,
      instagramHandle: s.instagramHandle as string | null,
      facebookHandle: s.facebookHandle as string | null,
      menuIntro: s.menuIntro as string | null,
      menuPublished: s.menuPublished as boolean,
      googleReviewUrl: s.googleReviewUrl as string | null,
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
  // Livro de receitas: livros e receitas marcados (versoes e entradas vao em
  // cascata), e as contas de teste.
  await prisma.cookbook.deleteMany({ where: { title: { startsWith: MARCA } } });
  // Calendario: eventos marcados (plano e notas vao em cascata). Os planos
  // de fichas marcadas em datas conhecidas vao com a ficha, mais abaixo.
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: MARCA } } });
  await prisma.bookRecipe.deleteMany({ where: { title: { startsWith: MARCA } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: MARCA.toLowerCase() } } });
  // Encomendas: as de clientes marcados, e as que levam fichas marcadas (estas
  // seguram a ficha). As ordens de producao que nasceram delas vao primeiro.
  const encomendasMarcadas = {
    OR: [
      { customer: { name: { startsWith: MARCA } } },
      { lines: { some: { recipeId: { in: fichas } } } },
    ],
  };
  await prisma.productionOrder.deleteMany({
    where: { customerOrders: { some: encomendasMarcadas } },
  });
  await prisma.customerOrder.deleteMany({ where: encomendasMarcadas });
  // Cardapio: promocoes, cupoes e secoes marcados; itens marcados pelo nome,
  // ligados a fichas marcadas, ou combos que as levam (um combo seguraria a
  // ficha: MenuComboItem e Restrict).
  await prisma.promotion.deleteMany({ where: { name: { startsWith: MARCA } } });
  await prisma.coupon.deleteMany({ where: { code: { startsWith: MARCA } } });
  await prisma.menuItem.deleteMany({
    where: {
      OR: [
        { name: { startsWith: MARCA } },
        { recipeId: { in: fichas } },
        { components: { some: { recipeId: { in: fichas } } } },
      ],
    },
  });
  await prisma.menuSection.deleteMany({ where: { name: { startsWith: MARCA } } });
  // Marketing: campanhas marcadas (as tarefas vao em cascata) e secoes do guia.
  await prisma.campaign.deleteMany({ where: { title: { startsWith: MARCA } } });
  await prisma.marketingGuideSection.deleteMany({ where: { title: { startsWith: MARCA } } });
  await prisma.customer.deleteMany({ where: { name: { startsWith: MARCA } } });
  // Os testes gastam numeros de encomenda; sem isto a casa passava da #1 para a #9.
  // Schema explicito: o adaptador do Prisma 7 nao muda o search_path (ver `tabela`).
  const t = tabela('CustomerOrder');
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${t}', 'number'), COALESCE((SELECT MAX("number") FROM ${t}), 0) + 1, false)`,
  );
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
