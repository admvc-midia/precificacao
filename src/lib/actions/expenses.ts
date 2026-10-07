'use server';

/**
 * Despesas fixas, e a percentagem que sai delas.
 *
 * A percentagem **nao** se aplica sozinha. E a mesma regra das cotacoes de
 * preco: a aplicacao calcula e mostra a diferenca, e quem manda no numero que
 * precifica a casa toda e o utilizador. Um preco que muda sozinho por baixo
 * dos pes de alguem e pior que um preco desatualizado, porque ninguem repara.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { parseDecimal } from '@/lib/money';
import { alvoDoFormulario, registar, resumoDoFormulario } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const EXPENSE_PERIOD = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const EXPENSE_CATEGORY = z.enum([
  'RENT',
  'UTILITIES',
  'LABOUR',
  'SERVICES',
  'TAXES',
  'MARKETING',
  'OTHER',
]);

const expenseSchema = z.object({
  name: z.string().trim().min(1, 'A despesa precisa de um nome.'),
  amount: z.number().min(0, 'O valor nao pode ser negativo.'),
  period: EXPENSE_PERIOD,
  category: EXPENSE_CATEGORY,
  active: z.boolean(),
  notes: z.string().trim().optional(),
});

function revalidar() {
  revalidatePath('/despesas');
  revalidatePath('/configuracoes');
  // A percentagem entra no preco de tudo.
  revalidatePath('/precificacao', 'layout');
  revalidatePath('/');
}

export async function saveExpense(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');

    const dados = expenseSchema.parse({
      name: String(form.get('name') ?? ''),
      amount: parseDecimal(String(form.get('amount') ?? '')),
      period: String(form.get('period') ?? 'MONTHLY'),
      category: String(form.get('category') ?? 'OTHER'),
      // Uma caixa desmarcada nao e enviada. O marcador diz que o formulario
      // que a contem foi mesmo submetido, e nao que ela veio marcada.
      active: form.get('activeSubmitted')
        ? form.get('active') === 'on' || form.get('active') === '1'
        : true,
      notes: String(form.get('notes') ?? ''),
    });

    const payload = { ...dados, notes: dados.notes || null };

    if (id) {
      await prisma.expense.update({ where: { id }, data: payload });
    } else {
      await prisma.expense.create({ data: payload });
    }

    revalidar();
    return { ok: true, message: id ? 'Despesa atualizada.' : 'Despesa acrescentada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteExpense(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Despesa nao informada.');

    await prisma.expense.delete({ where: { id } });

    revalidar();
    await registar({ quem: eu, acao: 'despesa.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Despesa removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Liga ou desliga uma despesa sem abrir o formulario. */
export async function toggleExpense(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Despesa nao informada.');

    const atual = await prisma.expense.findUnique({ where: { id } });
    if (!atual) throw new Error('Despesa nao encontrada.');

    await prisma.expense.update({
      where: { id },
      data: { active: !atual.active },
    });

    revalidar();
    return {
      ok: true,
      message: atual.active
        ? `"${atual.name}" deixou de contar.`
        : `"${atual.name}" voltou a contar.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Guarda a faturacao mensal esperada, usada quando ainda nao ha vendas. */
export async function saveExpectedRevenue(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const bruto = String(form.get('expectedMonthlyRevenue') ?? '').trim();
    const valor = bruto ? parseDecimal(bruto) : null;

    if (valor !== null && valor < 0) {
      throw new Error('A faturacao esperada nao pode ser negativa.');
    }

    await prisma.settings.update({
      where: { id: 'default' },
      data: { expectedMonthlyRevenue: valor },
    });

    revalidar();
    await registar({ quem: eu, acao: 'despesas.faturacao-esperada', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return {
      ok: true,
      message:
        valor === null
          ? 'Passou a usar o que as vendas registadas disserem.'
          : 'Faturacao esperada guardada.',
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Passa a percentagem calculada para a configuracao.
 *
 * E o unico sitio onde `fixedCostRate` muda por causa das despesas, e e
 * preciso carregar num botao para isso acontecer.
 */
export async function applyFixedCostRate(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const rate = parseDecimal(String(form.get('rate') ?? ''));

    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Percentagem invalida.');
    }
    if (rate >= 1) {
      throw new Error(
        'As despesas fixas sao iguais ou maiores que a receita. Nao ha preco que resolva isso, e por isso a aplicacao nao aceita esta percentagem: o que ela faria era mandar subir os precos ate ao infinito.',
      );
    }

    const antes = await prisma.settings.findUnique({ where: { id: 'default' } });
    await prisma.settings.update({
      where: { id: 'default' },
      data: { fixedCostRate: rate },
    });

    const de = Number(antes?.fixedCostRate ?? 0) * 100;
    const para = rate * 100;

    revalidar();
    await registar({ quem: eu, acao: 'despesas.aplicar-custos-fixos', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return {
      ok: true,
      message: `Custos fixos passaram de ${de.toFixed(1)}% para ${para.toFixed(1)}%. Todos os precos sugeridos foram recalculados.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
