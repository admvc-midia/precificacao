'use server';

/** Ordens de producao e lista de compras (Modulo 4). */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { buildCostContext } from '@/lib/mappers';
import { parseQty } from '@/lib/money';
import { buildPurchaseList } from '@/lib/pricing/purchase';
import { registar } from '@/lib/registo';
import { exigirDono, exigirPerfil } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

export async function createOrder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('De um nome a ordem de producao.');

    const dueRaw = String(form.get('dueAt') ?? '').trim();
    // <input type="date"> devolve "2026-10-03"; sem hora, o Date fica em UTC,
    // o que e o que queremos para uma data de producao.
    const dueAt = dueRaw ? new Date(`${dueRaw}T00:00:00.000Z`) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new Error('Data invalida.');
    }

    const order = await prisma.productionOrder.create({
      data: {
        name,
        dueAt,
        notes: String(form.get('notes') ?? '').trim() || null,
        promotional: form.get('promotional') === 'on',
      },
    });

    revalidatePath('/producao');
    revalidatePath(`/producao/${order.id}`);
    return { ok: true, message: 'Ordem criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteOrder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Ordem nao informada.');
    await prisma.productionOrder.delete({ where: { id } });
    revalidatePath('/producao');
    return { ok: true, message: 'Ordem removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function addOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const orderId = String(form.get('orderId') ?? '');
    const recipeId = String(form.get('recipeId') ?? '');
    const qty = parseQty(String(form.get('qty') ?? ''));

    if (!orderId) throw new Error('Ordem nao informada.');
    if (!recipeId) throw new Error('Escolha um produto.');
    if (qty <= 0) throw new Error('A quantidade tem de ser maior que zero.');

    // Pedir o mesmo produto duas vezes soma, em vez de criar uma linha
    // duplicada que o utilizador teria de somar de cabeca.
    const existing = await prisma.productionOrderLine.findFirst({
      where: { orderId, recipeId },
    });

    if (existing) {
      await prisma.productionOrderLine.update({
        where: { id: existing.id },
        data: { qty: Number(existing.qty) + qty },
      });
    } else {
      await prisma.productionOrderLine.create({ data: { orderId, recipeId, qty } });
    }

    revalidatePath(`/producao/${orderId}`);
    revalidatePath('/producao');
    return { ok: true, message: 'Produto adicionado a ordem.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Define a quantidade de uma linha da ordem.
 *
 * Repare que **define**, nao soma — ao contrario do `addOrderLine`. Sem isto
 * nao havia forma de baixar uma quantidade: so apagando a linha e voltando a
 * cria-la.
 */
export async function updateOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    const qty = parseQty(String(form.get('qty') ?? ''));

    if (!id) throw new Error('Linha nao informada.');
    if (qty <= 0) {
      throw new Error('A quantidade tem de ser maior que zero. Para tirar o produto, remova a linha.');
    }

    const line = await prisma.productionOrderLine.update({
      where: { id },
      data: { qty },
    });

    revalidatePath(`/producao/${line.orderId}`);
    revalidatePath('/producao');
    return { ok: true, message: 'Quantidade atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    const orderId = String(form.get('orderId') ?? '');
    if (!id) throw new Error('Linha nao informada.');

    await prisma.productionOrderLine.delete({ where: { id } });

    revalidatePath(`/producao/${orderId}`);
    revalidatePath('/producao');
    return { ok: true, message: 'Produto removido da ordem.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Congela a lista de compras com os precos e o estoque de hoje.
 *
 * A lista mostrada na pagina e sempre recalculada ao vivo — se um insumo
 * mudar de preco amanha, o numero muda. Congelar serve para guardar o que
 * foi combinado no momento do planeamento, e para a aplicacao poder dizer
 * depois quanto e que a conta se mexeu.
 */
export async function freezePurchaseList(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const orderId = String(form.get('orderId') ?? '');
    if (!orderId) throw new Error('Ordem nao informada.');

    const [order, ingredients, recipes] = await Promise.all([
      prisma.productionOrder.findUnique({
        where: { id: orderId },
        include: { lines: true },
      }),
      prisma.ingredient.findMany(),
      prisma.recipe.findMany({ include: { items: true } }),
    ]);

    if (!order) throw new Error('Ordem nao encontrada.');
    if (order.lines.length === 0) {
      throw new Error('Adicione pelo menos um produto antes de guardar a lista.');
    }

    const ctx = buildCostContext(ingredients, recipes);
    const list = buildPurchaseList(
      order.lines.map((l) => ({ recipeId: l.recipeId, qty: Number(l.qty) })),
      ctx,
    );

    const toBuy = list.lines.filter((l) => l.packsToBuy > 0);

    await prisma.$transaction([
      prisma.purchaseListLine.deleteMany({ where: { orderId } }),
      prisma.purchaseListLine.createMany({
        data: toBuy.map((l) => ({
          orderId,
          ingredientId: l.ingredient.id,
          requiredBase: l.requiredBase,
          stockBase: l.stockBase,
          missingBase: l.missingBase,
          packsToBuy: l.packsToBuy,
          estimatedCost: l.cost,
        })),
      }),
      // `updatedAt` passa a marcar quando a lista foi congelada.
      prisma.productionOrder.update({
        where: { id: orderId },
        data: { updatedAt: new Date() },
      }),
    ]);

    revalidatePath(`/producao/${orderId}`);
    revalidatePath('/producao');
    return {
      ok: true,
      message: `Lista guardada: ${toBuy.length} item(s) a comprar.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * "Produzir" a partir de uma ficha (na ficha tecnica ou no livro de
 * receitas): cria uma ordem so com esse produto e abre-a — dai em diante e o
 * caminho de sempre (lista de compras, registar a producao).
 *
 * Dono e cozinha: a cozinha ja manda produzir as encomendas; isto e o mesmo
 * para um produto solto. So produtos finais (a quantidade e em porcoes).
 */
export async function produzirFicha(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const eu = await exigirPerfil('OWNER', 'KITCHEN');
    const recipeId = String(form.get('recipeId') ?? '');
    const ficha = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { name: true, kind: true } });
    if (!ficha) throw new Error('Ficha nao encontrada.');
    if (ficha.kind !== 'PRODUCT') throw new Error('So se produzem produtos finais; uma preparacao base entra pelas fichas que a usam.');

    const qty = parseQty(String(form.get('qty') ?? ''));
    if (!(qty > 0)) throw new Error('A quantidade tem de ser maior que zero.');
    if (qty > 100_000) throw new Error('Quantidade alta demais: confira a virgula.');

    const dueRaw = String(form.get('dueAt') ?? '').trim();
    const dueAt = dueRaw ? new Date(`${dueRaw}T00:00:00.000Z`) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error('Data invalida.');
    const dia = dueAt ? `${dueRaw.slice(8, 10)}/${dueRaw.slice(5, 7)}` : null;

    const order = await prisma.productionOrder.create({
      data: {
        name: dia ? `${ficha.name} · ${dia}` : ficha.name,
        dueAt,
        notes: String(form.get('notes') ?? '').trim() || null,
        lines: { create: [{ recipeId, qty }] },
      },
    });
    id = order.id;
    revalidatePath('/producao');
    await registar({ quem: eu, acao: 'producao.da-ficha', alvo: ficha.name, detalhe: `${qty} un.${dia ? ` para ${dia}` : ''}` });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/producao/${id}`);
}
