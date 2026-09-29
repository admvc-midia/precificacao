/**
 * Despejo de tudo o que ha, em JSON, antes de uma limpeza.
 *
 * Nao e uma copia de seguranca a serio — nao restaura sozinho. E so a rede
 * para o caso de alguem se lembrar, depois de apagar, de uma ficha que
 * gostava de ter escrito outra vez.
 *
 *   npx tsx prisma/dump-dados.mts <ficheiro.json>
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const destino = process.argv[2] ?? 'dump.json';

const dados = {
  gravadoEm: new Date().toISOString(),
  settings: await prisma.settings.findMany(),
  salesChannels: await prisma.salesChannel.findMany(),
  suppliers: await prisma.supplier.findMany(),
  ingredients: await prisma.ingredient.findMany(),
  supplierOffers: await prisma.supplierOffer.findMany(),
  priceQuotes: await prisma.priceQuote.findMany(),
  recipes: await prisma.recipe.findMany(),
  recipeItems: await prisma.recipeItem.findMany(),
  productionOrders: await prisma.productionOrder.findMany(),
  productionOrderLines: await prisma.productionOrderLine.findMany(),
  purchaseListLines: await prisma.purchaseListLine.findMany(),
  stockMovements: await prisma.stockMovement.findMany(),
  salesRecords: await prisma.salesRecord.findMany(),
};

// `Decimal` do Prisma e `Date` nao sao JSON: viram texto.
writeFileSync(
  destino,
  JSON.stringify(dados, (_k, v) => (typeof v === 'object' && v !== null && 'toFixed' in v ? String(v) : v), 2),
  'utf8',
);

const total = Object.entries(dados)
  .filter(([, v]) => Array.isArray(v))
  .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
  .join(' ');
console.log(`Gravado em ${destino}`);
console.log(total);
await prisma.$disconnect();
