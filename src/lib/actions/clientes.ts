'use server';

/**
 * Clientes: criar, alterar e apagar.
 *
 * Tudo por presenca: so muda o campo que vem no formulario. Um campo ausente
 * nao e um campo vazio — e a mesma regra que impediu que as configuracoes
 * voltassem a ir a zero.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { validBirthday, type CustomerSource } from '@/lib/pricing/clientes';
import { alvoDoFormulario, registar, resumoDoFormulario } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const ORIGENS: CustomerSource[] = [
  'INSTAGRAM',
  'FACEBOOK',
  'WHATSAPP',
  'REFERRAL',
  'WALK_IN',
  'EVENT',
  'OTHER',
];

function campo(form: FormData, nome: string): string | undefined {
  return form.has(nome) ? String(form.get(nome) ?? '').trim() : undefined;
}

/** "12/11" ou "12-11" para dia e mes. Vazio limpa. */
function lerAniversario(raw: string): { birthDay: number | null; birthMonth: number | null } {
  if (!raw) return { birthDay: null, birthMonth: null };
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/.exec(raw);
  if (!m || !validBirthday(Number(m[1]), Number(m[2]))) {
    throw new Error('Aniversario invalido. Escreva dia/mes, por exemplo 12/11.');
  }
  return { birthDay: Number(m[1]), birthMonth: Number(m[2]) };
}

interface DadosCliente {
  name?: string;
  phone?: string | null;
  birthDay?: number | null;
  birthMonth?: number | null;
  source?: CustomerSource | null;
  referredById?: string | null;
  likes?: string | null;
  dislikes?: string | null;
  notes?: string | null;
}

/** Os campos do formulario que vieram, ja validados. */
function lerCampos(form: FormData, id: string | null): DadosCliente {
  const data: DadosCliente = {};

  const name = campo(form, 'name');
  if (name !== undefined) {
    if (!name) throw new Error('O nome nao pode ficar vazio.');
    data.name = name;
  }
  const phone = campo(form, 'phone');
  if (phone !== undefined) data.phone = phone || null;

  const aniversario = campo(form, 'birthday');
  if (aniversario !== undefined) Object.assign(data, lerAniversario(aniversario));

  const source = campo(form, 'source');
  if (source !== undefined) {
    if (source && !ORIGENS.includes(source as CustomerSource)) throw new Error('Origem invalida.');
    data.source = (source || null) as CustomerSource | null;
  }
  const referredById = campo(form, 'referredById');
  if (referredById !== undefined) {
    if (referredById && referredById === id) throw new Error('Um cliente nao se pode indicar a si proprio.');
    data.referredById = referredById || null;
  }

  for (const k of ['likes', 'dislikes', 'notes'] as const) {
    const v = campo(form, k);
    if (v !== undefined) data[k] = v || null;
  }
  return data;
}

function revalidar(id?: string) {
  revalidatePath('/clientes');
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath('/encomendas', 'layout');
  revalidatePath('/pos-venda');
  revalidatePath('/');
}

export async function createCustomer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    await exigirDono();
    const data = lerCampos(form, null);
    if (!data.name) throw new Error('Escreva o nome do cliente.');
    const c = await prisma.customer.create({
      data: {
        ...data,
        name: data.name,
        contactConsentAt: form.get('contactConsent') === 'on' ? new Date() : null,
      },
    });
    id = c.id;
    revalidar(id);
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/clientes/${id}`);
}

/**
 * Altera o cliente. O consentimento traz um marcador (`consentSubmitted`),
 * porque uma caixa desmarcada nao chega ao servidor — sem ele, nao se
 * distinguia "retirou o consentimento" de "o campo nao veio".
 *
 * Retirar o consentimento tira tambem os pos-vendas por fazer: a partir dai
 * a casa nao lhe pode escrever.
 */
export async function updateCustomer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Cliente nao informado.');

    const data: DadosCliente & { contactConsentAt?: Date | null } = lerCampos(form, id);

    let retirou = false;
    if (form.has('consentSubmitted')) {
      const atual = await prisma.customer.findUnique({
        where: { id },
        select: { contactConsentAt: true },
      });
      const quer = form.get('contactConsent') === 'on';
      // Manter a data original quando continua marcado: e a prova de quando foi dado.
      data.contactConsentAt = quer ? (atual?.contactConsentAt ?? new Date()) : null;
      retirou = !quer && Boolean(atual?.contactConsentAt);
    }

    await prisma.$transaction([
      prisma.customer.update({ where: { id }, data }),
      ...(retirou
        ? [
            prisma.customerOrder.updateMany({
              where: { customerId: id, feedbackAt: null, followUpDueAt: { not: null } },
              data: { followUpDueAt: null },
            }),
          ]
        : []),
    ]);
    revalidar(id);
    await registar({ quem: eu, acao: 'cliente.alterar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Cliente atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Apaga o cliente (direito ao apagamento, RGPD). As encomendas ficam, sem
 * nome: sao vendas da casa e contam nos resultados.
 */
export async function deleteCustomer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Cliente nao informado.');
    await prisma.$transaction([
      prisma.customerOrder.updateMany({
        where: { customerId: id, feedbackAt: null },
        data: { followUpDueAt: null },
      }),
      prisma.customer.delete({ where: { id } }),
    ]);
    revalidar();
    await registar({ quem: eu, acao: 'cliente.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/clientes');
}
