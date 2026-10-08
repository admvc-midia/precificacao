/**
 * Esvaziar os dados de trabalho, mantendo a configuracao.
 *
 * Serve para limpar o que se cadastrou a experimentar e comecar com dados a
 * serio. Apaga insumos, fornecedores, fichas, producoes, estoque, encomendas,
 * clientes e lembretes.
 * **Nao** toca em `Settings` nem nos canais de venda: sao a configuracao da
 * casa (nome, moeda, IVA, custos fixos, margem, comissoes), custaram a
 * afinar e nao se reconstroem a partir de um talao. Tambem nao toca nas
 * **contas** (sem elas ninguem entrava) nem no **livro de receitas** (e o
 * conteudo da casa, nao dados de ensaio; a ligacao a ficha apaga-se sozinha).
 *
 * ---------------------------------------------------------------------------
 * ESTE BANCO E PARTILHADO
 * ---------------------------------------------------------------------------
 * O mesmo Postgres serve outro projeto, que vive no schema `public`. Este
 * vive no schema `precificaragao` (ver `?schema=` na DATABASE_URL). Por isso
 * aqui so se apaga pelo cliente do Prisma, tabela a tabela, nunca com um
 * `TRUNCATE` a schema nenhuma e nunca com `db push --accept-data-loss`.
 * No fim, o script conta as linhas do outro projeto para provar que ficaram
 * onde estavam.
 *
 * Uso:
 *   npx tsx prisma/reset-dados.mts           ensaio: diz o que faria
 *   npx tsx prisma/reset-dados.mts --apply   apaga mesmo
 */

// O Prisma 7 ja nao le o .env sozinho; tem de vir antes do cliente da app.
import 'dotenv/config';

import { prisma } from '../src/lib/db';

const aplicar = process.argv.includes('--apply');

/**
 * Ordem de filho para pai.
 *
 * Ha chaves estrangeiras sem cascata, entao apagar um insumo antes dos
 * movimentos de estoque dele rebenta. A ordem aqui e a unica parte delicada
 * do script.
 */
const APAGAR = [
  // As encomendas seguram as fichas (Restrict): vao primeiro.
  ['Lembretes', () => prisma.reminder.deleteMany()],
  ['Linhas de encomenda', () => prisma.customerOrderLine.deleteMany()],
  ['Encomendas', () => prisma.customerOrder.deleteMany()],
  ['Clientes', () => prisma.customer.deleteMany()],
  ['Movimentos de estoque', () => prisma.stockMovement.deleteMany()],
  ['Linhas de lista de compras', () => prisma.purchaseListLine.deleteMany()],
  ['Itens das listas (Compras)', () => prisma.shoppingItem.deleteMany()],
  ['Listas (Compras)', () => prisma.shoppingList.deleteMany()],
  ['Linhas de producao', () => prisma.productionOrderLine.deleteMany()],
  ['Ordens de producao', () => prisma.productionOrder.deleteMany()],
  ['Itens de ficha', () => prisma.recipeItem.deleteMany()],
  ['Fichas tecnicas', () => prisma.recipe.deleteMany()],
  ['Cotacoes', () => prisma.priceQuote.deleteMany()],
  ['Precos por fornecedor', () => prisma.supplierOffer.deleteMany()],
  ['Insumos', () => prisma.ingredient.deleteMany()],
  ['Fornecedores', () => prisma.supplier.deleteMany()],
] as const;

async function contagens() {
  return {
    Lembretes: await prisma.reminder.count(),
    'Linhas de encomenda': await prisma.customerOrderLine.count(),
    Encomendas: await prisma.customerOrder.count(),
    Clientes: await prisma.customer.count(),
    'Movimentos de estoque': await prisma.stockMovement.count(),
    'Linhas de lista de compras': await prisma.purchaseListLine.count(),
    'Itens das listas (Compras)': await prisma.shoppingItem.count(),
    'Listas (Compras)': await prisma.shoppingList.count(),
    'Linhas de producao': await prisma.productionOrderLine.count(),
    'Ordens de producao': await prisma.productionOrder.count(),
    'Itens de ficha': await prisma.recipeItem.count(),
    'Fichas tecnicas': await prisma.recipe.count(),
    Cotacoes: await prisma.priceQuote.count(),
    'Precos por fornecedor': await prisma.supplierOffer.count(),
    Insumos: await prisma.ingredient.count(),
    Fornecedores: await prisma.supplier.count(),
  };
}

/** Conta as linhas do outro projeto, para provar que nao lhes tocamos. */
async function outroProjeto(): Promise<number | null> {
  try {
    const [linha] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      'select count(*)::bigint as n from public.familias',
    );
    return Number(linha.n);
  } catch {
    return null;
  }
}

async function main() {
  const antes = await contagens();
  const familiasAntes = await outroProjeto();

  console.log(aplicar ? 'A APAGAR' : 'ENSAIO — nada sera apagado');
  console.log('-'.repeat(52));
  for (const [nome, n] of Object.entries(antes)) {
    console.log(`  ${nome.padEnd(30)} ${String(n).padStart(5)}`);
  }

  const settings = await prisma.settings.findFirst();
  const canais = await prisma.salesChannel.findMany({ orderBy: { name: 'asc' } });
  console.log('\nMANTIDO');
  console.log('-'.repeat(52));
  console.log(
    `  ${settings?.businessName ?? '(sem nome)'} · ${settings?.currency} · IVA ${(
      Number(settings?.vatRate ?? 0) * 100
    ).toFixed(0)}% · custos fixos ${(Number(settings?.fixedCostRate ?? 0) * 100).toFixed(0)}%`,
  );
  for (const c of canais) {
    console.log(`  canal: ${c.name}${c.active ? '' : ' (inativo)'}`);
  }
  console.log(
    `  ${await prisma.user.count()} conta(s) · ${await prisma.bookRecipe.count()} receita(s) do livro · ${await prisma.cookbook.count()} livro(s)`,
  );

  if (!aplicar) {
    console.log('\nPara apagar mesmo: npx tsx prisma/reset-dados.mts --apply');
    return;
  }

  console.log('\nA apagar...');
  for (const [nome, apaga] of APAGAR) {
    const { count } = await apaga();
    console.log(`  ${nome.padEnd(30)} -${count}`);
  }

  const depois = await contagens();
  const sobra = Object.entries(depois).filter(([, n]) => n > 0);
  console.log(
    sobra.length === 0
      ? '\nVazio.'
      : `\nSobrou: ${sobra.map(([k, n]) => `${k}=${n}`).join(', ')}`,
  );

  console.log(
    `Mantidos: ${await prisma.settings.count()} configuracao, ${await prisma.salesChannel.count()} canais.`,
  );

  const familiasDepois = await outroProjeto();
  if (familiasAntes !== null) {
    console.log(
      `Outro projeto (public.familias): ${familiasAntes} -> ${familiasDepois} linhas${
        familiasAntes === familiasDepois ? ' — intacto.' : ' — ATENCAO, mudou!'
      }`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
