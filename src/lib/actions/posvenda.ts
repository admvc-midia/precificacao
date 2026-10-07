'use server';

/**
 * Pos-venda e lembretes.
 *
 * Um pos-venda acaba de tres maneiras: o cliente respondeu (fica a nota),
 * nao atendeu (volta amanha), ou nao e para contactar (sai da lista sem
 * nota). Os lembretes escritos a mao sao coisas a fazer num dia.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { nextAttempt, parseRating, type ContactVia } from '@/lib/pricing/clientes';
import { parseLocalDateTime } from '@/lib/pricing/encomendas';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const VIAS: ContactVia[] = ['PHONE', 'WHATSAPP', 'IN_PERSON'];

function campo(form: FormData, nome: string): string | undefined {
  return form.has(nome) ? String(form.get(nome) ?? '').trim() : undefined;
}

function revalidar(orderId?: string, customerId?: string | null) {
  revalidatePath('/pos-venda');
  revalidatePath('/');
  revalidatePath('/relatorio');
  if (orderId) revalidatePath(`/encomendas/${orderId}`);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

/**
 * O cliente respondeu: nota geral (obrigatoria), notas por produto
 * (opcionais, `nota:<idDaLinha>`) e comentario. O pos-venda desta encomenda
 * fica feito.
 */
export async function registerFeedback(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'orderId');
    if (!id) throw new Error('Encomenda nao informada.');

    const via = campo(form, 'via') as ContactVia | undefined;
    if (!via || !VIAS.includes(via)) throw new Error('Diga como falou com o cliente.');

    const rating = parseRating(campo(form, 'rating'));
    if (rating === null) throw new Error('Escolha a nota geral, de 1 a 5.');

    const encomenda = await prisma.customerOrder.findUnique({
      where: { id },
      select: { customerId: true, lines: { select: { id: true } } },
    });
    if (!encomenda) throw new Error('Encomenda nao encontrada.');

    const daEncomenda = new Set(encomenda.lines.map((l) => l.id));
    const porLinha: Array<{ id: string; rating: number | null }> = [];
    for (const [chave, valor] of form.entries()) {
      if (!chave.startsWith('nota:')) continue;
      const linhaId = chave.slice(5);
      if (!daEncomenda.has(linhaId)) throw new Error('Produto nao pertence a encomenda.');
      porLinha.push({ id: linhaId, rating: parseRating(String(valor)) });
    }

    await prisma.$transaction([
      prisma.customerOrder.update({
        where: { id },
        data: {
          feedbackAt: new Date(),
          feedbackVia: via,
          rating,
          feedbackComment: campo(form, 'comment') || null,
          followUpDueAt: null,
        },
      }),
      ...porLinha.map((l) =>
        prisma.customerOrderLine.update({ where: { id: l.id }, data: { rating: l.rating } }),
      ),
    ]);

    revalidar(id, encomenda.customerId);
    return { ok: true, message: 'Opinião registada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Nao atendeu: volta a lista amanha, e conta-se a tentativa. */
export async function registerNoAnswer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'orderId');
    if (!id) throw new Error('Encomenda nao informada.');
    const e = await prisma.customerOrder.update({
      where: { id },
      data: { followUpDueAt: nextAttempt(new Date()), followUpAttempts: { increment: 1 } },
    });
    revalidar(id, e.customerId);
    return { ok: true, message: 'Fica para amanhã.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Nao e para contactar (ja disse o que achou ao balcao, ou desistiu-se): sai da lista. */
export async function skipFollowUp(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'orderId');
    if (!id) throw new Error('Encomenda nao informada.');
    const e = await prisma.customerOrder.update({
      where: { id },
      data: { followUpDueAt: null },
    });
    revalidar(id, e.customerId);
    return { ok: true, message: 'Tirado da lista.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

export async function createReminder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const title = campo(form, 'title') ?? '';
    if (!title) throw new Error('Escreva o que ha a fazer.');
    const dueAt = parseLocalDateTime(campo(form, 'dueAt') ?? '');
    if (!dueAt) throw new Error('Escolha o dia.');

    const customerId = campo(form, 'customerId') || null;
    const orderId = campo(form, 'orderId') || null;

    await prisma.reminder.create({
      data: { title, dueAt, customerId, orderId, notes: campo(form, 'notes') || null },
    });
    revalidar(orderId ?? undefined, customerId);
    return { ok: true, message: 'Lembrete criado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Feito, ou volta a por fazer. */
export async function toggleReminder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Lembrete nao informado.');
    const atual = await prisma.reminder.findUnique({ where: { id }, select: { doneAt: true } });
    if (!atual) throw new Error('Lembrete nao encontrado.');
    const r = await prisma.reminder.update({
      where: { id },
      data: { doneAt: atual.doneAt ? null : new Date() },
    });
    revalidar(r.orderId ?? undefined, r.customerId);
    return { ok: true, message: atual.doneAt ? 'Volta a estar por fazer.' : 'Feito.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteReminder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Lembrete nao informado.');
    const r = await prisma.reminder.delete({ where: { id } });
    revalidar(r.orderId ?? undefined, r.customerId);
    return { ok: true, message: 'Lembrete apagado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
