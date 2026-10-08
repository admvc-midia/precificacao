/**
 * Escritas partilhadas por varias actions: dar entrada/saida no estoque e
 * trocar o preco em uso de um insumo.
 *
 * Vivem fora de `lib/actions/` de proposito. Tudo o que um ficheiro
 * 'use server' exporta fica chamavel a partir do browser, e estas funcoes
 * gravam sem validar nada — quem as chama e que valida.
 */

import type { Prisma } from '@/generated/prisma/client';

import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import type { PlannedMovement, StockState } from '@/lib/pricing/stock';
import { baseUnitOf } from '@/lib/units';

/** Saldo e custo medio de todos os insumos, para alimentar o plano. */
export async function lerEstados(): Promise<Map<string, StockState>> {
  const rows = await prisma.ingredient.findMany({
    select: { id: true, stockBase: true, avgCostBase: true },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { qtyBase: num(r.stockBase), avgUnitCost: num(r.avgCostBase) },
    ]),
  );
}

/** Escreve o plano: os movimentos de uma vez, depois um saldo por insumo. */
export async function gravarPlano(
  plano: PlannedMovement[],
  orderId: string | null,
  guarda?: () => Promise<boolean>,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      if (guarda && !(await guarda())) {
        throw new Error('Esta operacao ja tinha sido registada.');
      }

      await tx.stockMovement.createMany({
        data: plano.map((m) => ({
          ingredientId: m.ingredientId,
          kind: m.kind,
          qtyBase: m.qtyBase,
          unitCost: m.unitCost,
          value: m.value,
          orderId,
          note: m.note ?? null,
        })),
      });

      // Um update por insumo: o Postgres nao tem update em massa com valores
      // diferentes por linha, e sao poucas linhas.
      const finais = new Map<string, PlannedMovement>();
      for (const m of plano) finais.set(m.ingredientId, m);

      for (const m of finais.values()) {
        await tx.ingredient.update({
          where: { id: m.ingredientId },
          data: { stockBase: m.finalQtyBase, avgCostBase: m.finalAvgCost },
        });
      }
    },
    // Folga generosa: a ligacao ao Supabase e remota e cada escrita custa
    // uma ida e volta.
    { timeout: 20000, maxWait: 10000 },
  );
}

// ---------------------------------------------------------------------------
// Entradas: receber uma compra

/**
 * Marca um preco como o que vale e copia-o para o insumo.
 *
 * Tudo numa transacao: se o insumo ficasse com o preco novo e a marca de
 * "em uso" continuasse noutra linha, a lista mostrava uma coisa e o custo das
 * fichas usava outra.
 */
export async function sincronizarEmUso(
  tx: Prisma.TransactionClient,
  ingredientId: string,
  offerId: string,
): Promise<void> {
  const oferta = await tx.supplierOffer.findUnique({ where: { id: offerId } });
  if (!oferta || oferta.ingredientId !== ingredientId) {
    throw new Error('Preco nao encontrado neste insumo.');
  }

  await tx.supplierOffer.updateMany({
    where: { ingredientId, NOT: { id: offerId } },
    data: { inUse: false },
  });
  await tx.supplierOffer.update({ where: { id: offerId }, data: { inUse: true } });

  await tx.ingredient.update({
    where: { id: ingredientId },
    data: {
      supplierId: oferta.supplierId,
      purchasePrice: num(oferta.purchasePrice),
      purchaseQty: num(oferta.purchaseQty),
      purchaseUnit: oferta.purchaseUnit,
      baseUnit: baseUnitOf(oferta.purchaseUnit),
    },
  });
}
