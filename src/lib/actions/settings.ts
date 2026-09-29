'use server';

/** Configuracoes globais e canais de venda (Modulo 5). */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { parseDecimal, parsePercent, SUPPORTED_CURRENCIES } from '@/lib/money';
import {
  CHANNEL_KIND,
  errorMessage,
  ROUNDING,
  VAT_MODE,
  type ActionState,
} from './shared';


/** Percentagem entre 0 e `max`, recusando valores que so podem ser engano. */
function rate(value: string, label: string, max = 0.95): number {
  const v = parsePercent(value);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${label}: valor invalido.`);
  if (v > max) {
    throw new Error(`${label}: ${(v * 100).toFixed(1)}% e alto demais. Confira se nao digitou o valor ja em fracao (0,3 em vez de 30).`);
  }
  return v;
}

export async function saveSettings(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const currency = String(form.get('currency') ?? 'EUR');
    const known = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
    if (!known) throw new Error('Moeda nao suportada.');

    const fixedCostRate = rate(String(form.get('fixedCostRate') ?? '0'), 'Custos fixos');
    const targetMargin = rate(String(form.get('targetMargin') ?? '0'), 'Margem alvo');

    if (fixedCostRate + targetMargin >= 1) {
      throw new Error(
        'Custos fixos + margem alvo somam 100% ou mais da receita: nao sobra nada para o produto. Reduza um dos dois.',
      );
    }

    await prisma.settings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    await prisma.settings.update({
      where: { id: 'default' },
      data: {
        businessName: String(form.get('businessName') ?? '').trim() || null,
        currency,
        // O locale acompanha a moeda: EUR -> pt-PT, BRL -> pt-BR.
        locale: String(form.get('locale') ?? '') || known.locale,
        vatRate: rate(String(form.get('vatRate') ?? '0'), 'IVA', 0.5),
        vatMode: VAT_MODE.parse(String(form.get('vatMode') ?? 'INCLUDED')),
        fixedCostRate,
        cardFeeRate: rate(String(form.get('cardFeeRate') ?? '0'), 'Taxa de cartao', 0.2),
        targetCmv: rate(String(form.get('targetCmv') ?? '30'), 'CMV alvo'),
        targetMargin,
        rounding: ROUNDING.parse(String(form.get('rounding') ?? 'NONE')),
      },
    });

    revalidatePath('/configuracoes');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Configuracoes guardadas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function saveChannel(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('O nome do canal e obrigatorio.');

    const cardRaw = String(form.get('cardFeeRate') ?? '').trim();

    const payload = {
      name,
      kind: CHANNEL_KIND.parse(String(form.get('kind') ?? 'COUNTER')),
      commissionRate: rate(String(form.get('commissionRate') ?? '0'), 'Comissao'),
      deliveryCost: parseDecimal(String(form.get('deliveryCost') ?? '0')),
      // Vazio = herda a taxa global; "0" = o canal nao cobra cartao.
      cardFeeRate: cardRaw ? rate(cardRaw, 'Taxa de cartao', 0.2) : null,
      usesDeliveryPackaging: form.get('usesDeliveryPackaging') === 'on',
      // Um checkbox so e enviado quando esta marcado, entao "desmarcado" e
      // "ausente do formulario" chegam aqui iguais. O marcador escondido
      // desempata — sem ele nunca se conseguia desativar um canal, porque
      // ausente era sempre lido como ativo.
      active: form.has('activeSubmitted') ? form.get('active') === 'on' : true,
    };

    if (id) {
      await prisma.salesChannel.update({ where: { id }, data: payload });
    } else {
      await prisma.salesChannel.create({ data: payload });
    }

    revalidatePath('/configuracoes');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: id ? 'Canal atualizado.' : 'Canal criado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteChannel(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Canal nao informado.');
    await prisma.salesChannel.delete({ where: { id } });
    revalidatePath('/configuracoes');
    revalidatePath('/precificacao');
    return { ok: true, message: 'Canal removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
