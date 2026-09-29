'use server';

/** Registo de vendas por mes (Modulo 5 — engenharia de cardapio e CMV real). */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { parseDecimal } from '@/lib/money';
import { errorMessage, type ActionState } from './shared';

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Guarda as vendas de um mes inteiro de uma vez.
 *
 * O formulario traz um campo por produto (`qty:<recipeId>`), porque quem
 * lanca as vendas do mes lanca todas de seguida — obrigar a gravar produto a
 * produto seria uma volta ao servidor por linha.
 *
 * Quantidade vazia ou zero **apaga** o registo em vez de guardar um zero: nao
 * ter vendido e diferente de nao ter lancado, e a engenharia de cardapio
 * precisa de distinguir os dois.
 */
export async function saveSales(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const period = String(form.get('period') ?? '').trim();
    if (!PERIODO.test(period)) {
      throw new Error('Periodo invalido. Use o formato AAAA-MM.');
    }

    const guardar: Array<{ recipeId: string; qty: number; revenue: number | null }> = [];
    const apagar: string[] = [];

    for (const [chave, valor] of form.entries()) {
      if (!chave.startsWith('qty:')) continue;
      const recipeId = chave.slice(4);
      const qty = parseDecimal(String(valor));

      if (qty <= 0) {
        apagar.push(recipeId);
        continue;
      }

      const receitaRaw = String(form.get(`rev:${recipeId}`) ?? '').trim();
      guardar.push({
        recipeId,
        qty,
        revenue: receitaRaw ? parseDecimal(receitaRaw) : null,
      });
    }

    if (guardar.length === 0 && apagar.length === 0) {
      throw new Error('Nada para guardar.');
    }

    await prisma.$transaction([
      ...(apagar.length > 0
        ? [
            prisma.salesRecord.deleteMany({
              where: { period, recipeId: { in: apagar } },
            }),
          ]
        : []),
      ...guardar.map((v) =>
        prisma.salesRecord.upsert({
          where: { recipeId_period: { recipeId: v.recipeId, period } },
          create: { recipeId: v.recipeId, period, qty: v.qty, revenue: v.revenue },
          update: { qty: v.qty, revenue: v.revenue },
        }),
      ),
    ]);

    revalidatePath('/vendas');
    revalidatePath('/');
    return {
      ok: true,
      message: `Vendas de ${period} guardadas: ${guardar.length} produto(s).`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
