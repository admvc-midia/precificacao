'use server';

/**
 * Calendario de producao: eventos do dono, o plano de cada data (produzir
 * mais, menos, nao produzir) e como correu cada ano. So o dono escreve; a
 * cozinha so le.
 *
 * Uma data conhecida (feriado, Dia das Criancas) nao tem linha na base ate o
 * dono lhe juntar alguma coisa: as actions recebem `chave` em vez de
 * `eventoId` e criam-na nessa altura.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { datasDoAno } from '@/lib/calendario/datas';
import { prisma } from '@/lib/db';
import { registar } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o dia.').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Dia invalido.');
const TIPO = z.enum(['EVENT', 'TREND', 'TEAM']);
const ACAO = z.enum(['MORE', 'LESS', 'NONE']);
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No maximo ${max} caracteres.`)
    .transform((v) => v || null);

function revalidar() {
  revalidatePath('/calendario');
  revalidatePath('/encomendas');
  revalidatePath('/producao');
}

/** O evento a que o formulario se refere; uma data conhecida ganha linha agora. */
async function garantirEvento(form: FormData): Promise<{ id: string; titulo: string }> {
  const id = String(form.get('eventoId') ?? '');
  if (id) {
    const e = await prisma.calendarEvent.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!e) throw new Error('Evento nao encontrado.');
    return { id: e.id, titulo: e.title };
  }
  const chave = String(form.get('chave') ?? '');
  const conhecida = datasDoAno(new Date().getUTCFullYear()).find((d) => d.chave === chave);
  if (!conhecida) throw new Error('Data desconhecida.');
  const e = await prisma.calendarEvent.upsert({
    where: { knownKey: chave },
    create: { knownKey: chave, title: conhecida.titulo, yearly: true },
    update: {},
    select: { id: true, title: true },
  });
  return { id: e.id, titulo: e.title };
}

export async function criarEvento(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const d = z
      .object({
        title: z.string().trim().min(1, 'Escreva o nome do evento.').max(120, 'Nome demasiado longo.'),
        day: DIA,
        kind: TIPO,
        notes: texto(2000),
      })
      .parse({
        title: form.get('title') ?? '',
        day: form.get('day') ?? '',
        kind: form.get('kind') ?? 'EVENT',
        notes: form.get('notes') ?? '',
      });
    const yearly = form.get('yearly') === 'on';
    await prisma.calendarEvent.create({
      data: { title: d.title, day: new Date(`${d.day}T00:00:00Z`), kind: d.kind, notes: d.notes, yearly },
    });
    revalidar();
    await registar({ quem: eu, acao: 'calendario.criar', alvo: d.title, detalhe: `${d.day}${yearly ? ' (todos os anos)' : ''}` });
    return { ok: true, message: 'Evento criado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function alterarEvento(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const e = await garantirEvento(form);
    const atual = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: e.id } });
    const notes = texto(2000).parse(form.get('notes') ?? '');
    if (atual.knownKey) {
      // Uma data conhecida: o nome e o dia vem do calculo; so as notas sao do dono.
      await prisma.calendarEvent.update({ where: { id: e.id }, data: { notes } });
    } else {
      const d = z
        .object({
          title: z.string().trim().min(1, 'Escreva o nome do evento.').max(120, 'Nome demasiado longo.'),
          day: DIA,
          kind: TIPO,
        })
        .parse({ title: form.get('title') ?? '', day: form.get('day') ?? '', kind: form.get('kind') ?? 'EVENT' });
      await prisma.calendarEvent.update({
        where: { id: e.id },
        data: { title: d.title, day: new Date(`${d.day}T00:00:00Z`), kind: d.kind, notes, yearly: form.get('yearly') === 'on' },
      });
    }
    revalidar();
    await registar({ quem: eu, acao: 'calendario.alterar', alvo: e.titulo });
    return { ok: true, message: 'Guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Apaga um evento do dono, com o plano e as notas de como correu. */
export async function apagarEvento(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('eventoId') ?? '');
    const e = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!e) throw new Error('Evento nao encontrado.');
    if (e.knownKey) throw new Error('As datas conhecidas nao se apagam; tire o plano e as notas.');
    await prisma.calendarEvent.delete({ where: { id } });
    revalidar();
    await registar({ quem: eu, acao: 'calendario.apagar', alvo: e.title });
    return { ok: true, message: 'Evento apagado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Junta (ou muda) um produto no plano da data. */
export async function guardarPlano(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const d = z
      .object({
        recipeId: z.string().min(1, 'Escolha o produto.'),
        action: ACAO,
        qty: z
          .string()
          .trim()
          .transform((v) => (v ? Number(v) : null))
          .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 100_000), 'A quantidade e um numero inteiro.'),
        note: texto(300),
      })
      .parse({
        recipeId: form.get('recipeId') ?? '',
        action: form.get('action') ?? '',
        qty: form.get('qty') ?? '',
        note: form.get('note') ?? '',
      });
    const produto = await prisma.recipe.findUnique({ where: { id: d.recipeId }, select: { name: true, kind: true } });
    if (!produto || produto.kind !== 'PRODUCT') throw new Error('Produto nao encontrado.');
    const e = await garantirEvento(form);
    const qty = d.action === 'NONE' ? null : d.qty;
    await prisma.calendarPlanItem.upsert({
      where: { eventId_recipeId: { eventId: e.id, recipeId: d.recipeId } },
      create: { eventId: e.id, recipeId: d.recipeId, action: d.action, qty, note: d.note },
      update: { action: d.action, qty, note: d.note },
    });
    revalidar();
    await registar({ quem: eu, acao: 'calendario.plano', alvo: e.titulo, detalhe: `${produto.name}: ${d.action}${qty ? ` ${qty}` : ''}` });
    return { ok: true, message: 'Plano guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function tirarDoPlano(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const p = await prisma.calendarPlanItem.findUnique({
      where: { id },
      include: { recipe: { select: { name: true } }, event: { select: { title: true } } },
    });
    if (!p) throw new Error('Linha do plano nao encontrada.');
    await prisma.calendarPlanItem.delete({ where: { id } });
    revalidar();
    await registar({ quem: eu, acao: 'calendario.plano', alvo: p.event.title, detalhe: `${p.recipe.name}: tirado` });
    return { ok: true, message: 'Tirado do plano.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Como correu num ano. Texto vazio apaga a nota desse ano. */
export async function guardarRevisao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const ano = Number(form.get('ano'));
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error('Ano invalido.');
    const text = texto(2000).parse(form.get('text') ?? '');
    const e = await garantirEvento(form);
    if (text) {
      await prisma.calendarReview.upsert({
        where: { eventId_year: { eventId: e.id, year: ano } },
        create: { eventId: e.id, year: ano, text },
        update: { text },
      });
    } else {
      await prisma.calendarReview.deleteMany({ where: { eventId: e.id, year: ano } });
    }
    revalidar();
    await registar({ quem: eu, acao: 'calendario.como-correu', alvo: `${e.titulo} ${ano}` });
    return { ok: true, message: 'Guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
