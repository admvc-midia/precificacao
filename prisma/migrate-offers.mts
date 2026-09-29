/**
 * Migracao unica: cada insumo passa a ter o seu preco atual como primeiro
 * item da lista de fornecedores, marcado como em uso.
 *
 * Antes desta mudanca, o preco vivia na propria linha do insumo e havia um
 * unico fornecedor. Agora o preco e uma entrada da lista — mas o valor tem de
 * continuar exatamente o mesmo, ou o custo de todas as fichas mudava.
 *
 * E idempotente: correr duas vezes nao duplica nada.
 *
 *   npx tsx --env-file=.env prisma/migrate-offers.mts
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const insumos = await p.ingredient.findMany({ include: { offers: true } });

let criados = 0;
let marcados = 0;
let jaOk = 0;
let atualizados = 0;

for (const i of insumos) {
  const preco = Number(i.purchasePrice);
  const qty = Number(i.purchaseQty);

  // Procura uma entrada que ja descreva o preco atual.
  const igual = i.offers.find(
    (o) =>
      o.supplierId === i.supplierId &&
      Math.abs(Number(o.purchasePrice) - preco) < 1e-9 &&
      Math.abs(Number(o.purchaseQty) - qty) < 1e-9 &&
      o.purchaseUnit === i.purchaseUnit,
  );

  let emUso = igual;

  if (!emUso) {
    // Ja pode existir uma entrada deste fornecedor com outro preco: nesse
    // caso atualiza-se, porque o preco do insumo e o que manda.
    const doMesmoFornecedor = i.offers.find((o) => o.supplierId === i.supplierId);

    if (doMesmoFornecedor) {
      emUso = await p.supplierOffer.update({
        where: { id: doMesmoFornecedor.id },
        data: { purchasePrice: preco, purchaseQty: qty, purchaseUnit: i.purchaseUnit },
      });
      atualizados++;
    } else {
      emUso = await p.supplierOffer.create({
        data: {
          ingredientId: i.id,
          supplierId: i.supplierId,
          purchasePrice: preco,
          purchaseQty: qty,
          purchaseUnit: i.purchaseUnit,
          notes: 'Preco que ja estava no insumo',
        },
      });
      criados++;
    }
  } else if (emUso.inUse) {
    jaOk++;
    continue;
  }

  // Exatamente um em uso por insumo.
  await p.$transaction([
    p.supplierOffer.updateMany({
      where: { ingredientId: i.id, NOT: { id: emUso.id } },
      data: { inUse: false },
    }),
    p.supplierOffer.update({ where: { id: emUso.id }, data: { inUse: true } }),
  ]);
  marcados++;
}

console.log(`insumos: ${insumos.length}`);
console.log(`  precos criados a partir do insumo: ${criados}`);
console.log(`  precos existentes acertados: ${atualizados}`);
console.log(`  marcados como em uso: ${marcados}`);
console.log(`  ja estavam certos: ${jaOk}`);

await p.$disconnect();
