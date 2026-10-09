'use server';

/** Configuracoes globais e canais de venda (Modulo 5). */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { parseDecimal, parsePercent, SUPPORTED_CURRENCIES } from '@/lib/money';
import { alvoDoFormulario, registar, resumoDoFormulario } from '@/lib/registo';
import { lerLinkAvaliacao } from '@/lib/pricing/clientes';
import { exigirDono } from '@/lib/sessao';
import {
  CHANNEL_KIND,
  errorMessage,
  ROUNDING,
  VAT_MODE,
  type ActionState,
} from './shared';


/**
 * Um campo **ausente** do formulario nao e um campo vazio.
 *
 * Todos os campos liam-se com `String(form.get(x) ?? '0')`, o que faz de um
 * campo que nao veio um zero. Num formulario submetido pelo ecra isso nunca
 * se nota, porque o ecra manda sempre tudo. Mas basta um pedido que traga
 * dois campos para a configuracao inteira ir a zero — o IVA, os custos fixos,
 * a taxa de cartao, a margem alvo e o nome da casa — sem erro nenhum, porque
 * zero e um valor legitimo em todos eles.
 *
 * Aconteceu. O ecra so mostrou numeros diferentes, e os precos sugeridos
 * passaram a ignorar impostos e custos fixos em silencio.
 *
 * Agora distingue-se: ausente quer dizer "este formulario nao fala deste
 * campo, nao lhe toques"; presente e vazio continua a querer dizer zero, que
 * e o que apagar o conteudo de uma caixa deve significar.
 */
function presente(form: FormData, nome: string): boolean {
  return form.get(nome) !== null;
}

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
    const eu = await exigirDono();
    const currency = String(form.get('currency') ?? 'EUR');
    const known = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
    if (!known) throw new Error('Moeda nao suportada.');

    await prisma.settings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    const atual = await prisma.settings.findUniqueOrThrow({ where: { id: 'default' } });

    // So entra no update o que o formulario trouxe. O que ele nao trouxe fica
    // como esta, em vez de virar zero.
    const data: Record<string, unknown> = { currency };

    if (presente(form, 'businessName')) {
      data.businessName = String(form.get('businessName')).trim() || null;
    }
    // O locale acompanha a moeda: EUR -> pt-PT, BRL -> pt-BR.
    data.locale = String(form.get('locale') ?? '') || known.locale;

    if (presente(form, 'vatRate')) {
      data.vatRate = rate(String(form.get('vatRate')), 'IVA', 0.5);
    }
    if (presente(form, 'vatMode')) {
      data.vatMode = VAT_MODE.parse(String(form.get('vatMode')));
    }
    if (presente(form, 'cardFeeRate')) {
      data.cardFeeRate = rate(String(form.get('cardFeeRate')), 'Taxa de cartao', 0.2);
    }
    if (presente(form, 'targetCmv')) {
      data.targetCmv = rate(String(form.get('targetCmv')), 'CMV alvo');
    }
    if (presente(form, 'rounding')) {
      data.rounding = ROUNDING.parse(String(form.get('rounding')));
    }
    if (presente(form, 'displayDecimals')) {
      const casas = Number(form.get('displayDecimals'));
      if (casas !== 2 && casas !== 4) throw new Error('Casas decimais: escolha 2 ou automatico.');
      data.displayDecimals = casas;
    }

    // Estes dois validam-se um contra o outro, por isso comparam-se sempre os
    // valores que vao ficar — venham do formulario ou do que ja estava.
    const fixedCostRate = presente(form, 'fixedCostRate')
      ? rate(String(form.get('fixedCostRate')), 'Custos fixos')
      : Number(atual.fixedCostRate);
    const targetMargin = presente(form, 'targetMargin')
      ? rate(String(form.get('targetMargin')), 'Margem alvo')
      : Number(atual.targetMargin);

    if (fixedCostRate + targetMargin >= 1) {
      throw new Error(
        'Custos fixos + margem alvo somam 100% ou mais da receita: nao sobra nada para o produto. Reduza um dos dois.',
      );
    }

    if (presente(form, 'fixedCostRate')) data.fixedCostRate = fixedCostRate;
    if (presente(form, 'targetMargin')) data.targetMargin = targetMargin;

    await prisma.settings.update({ where: { id: 'default' }, data });

    // As casas decimais mudam a leitura de todas as paginas.
    revalidatePath('/', 'layout');
    revalidatePath('/configuracoes');
    revalidatePath('/precificacao');
    revalidatePath('/');
    await registar({ quem: eu, acao: 'configuracoes.guardar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Configuracoes guardadas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Pos-venda: dias ate perguntar e o texto da mensagem.
 *
 * Action propria, e nao o `saveSettings`: aquela escreve sempre a moeda e o
 * locale, e um formulario que so trouxesse a mensagem repunha-os por omissao.
 * Mensagem vazia volta a de origem.
 */
export async function saveFollowUpSettings(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const data: { followUpDays?: number; followUpMessage?: string | null; googleReviewUrl?: string | null } = {};
    if (presente(form, 'followUpDays')) {
      const dias = Number(String(form.get('followUpDays')).trim());
      if (!Number.isInteger(dias) || dias < 0 || dias > 60) {
        throw new Error('Dias ate ao pos-venda: um numero inteiro de 0 a 60.');
      }
      data.followUpDays = dias;
    }
    if (presente(form, 'followUpMessage')) {
      data.followUpMessage = String(form.get('followUpMessage')).trim() || null;
    }
    if (presente(form, 'googleReviewUrl')) {
      data.googleReviewUrl = lerLinkAvaliacao(String(form.get('googleReviewUrl')));
    }
    await prisma.settings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    revalidatePath('/configuracoes');
    revalidatePath('/pos-venda');
    await registar({ quem: eu, acao: 'configuracoes.pos-venda', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Pós-venda guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function saveChannel(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
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
    await registar({ quem: eu, acao: 'canal.guardar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
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
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Canal nao informado.');
    await prisma.salesChannel.delete({ where: { id } });
    revalidatePath('/configuracoes');
    revalidatePath('/precificacao');
    await registar({ quem: eu, acao: 'canal.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Canal removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
