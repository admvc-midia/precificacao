'use server';

/**
 * Marketing: campanhas, as suas tarefas, e o guia. Escrevem o dono e o
 * perfil MARKETING (`exigirMarketing`); tudo vai para o Registo.
 *
 * Nada aqui toca em precos, cupoes ou encomendas: uma campanha guarda os
 * CODIGOS dos cupoes, em texto, e o dono e que os cria em Loja → Cupoes.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { diaEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import { parseDecimal } from '@/lib/money';
import { CANAIS, ESTADOS, lerCodigos } from '@/lib/marketing/contas';
import { campanhasDoModelo, GUIA_DO_MODELO, somarDias } from '@/lib/marketing/modelo';
import { registar } from '@/lib/registo';
import { exigirMarketing } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

function revalidar(id?: string) {
  revalidatePath('/marketing');
  revalidatePath('/marketing/guia');
  if (id) revalidatePath(`/marketing/${id}`);
}

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No maximo ${max} caracteres.`)
    .transform((v) => v || null);

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function dia(raw: FormDataEntryValue | null, nome: string): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!DIA.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error(`Data de ${nome} invalida.`);
  return new Date(`${s}T00:00:00Z`);
}

/** Troca de lugar com a vizinha e renumera a lista (como no cardapio). */
async function trocar(ids: string[], id: string, sentido: number, gravar: (id: string, position: number) => Promise<unknown>) {
  const i = ids.indexOf(id);
  const j = i + sentido;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await prisma.$transaction(ids.map((x, pos) => gravar(x, pos) as never));
}

// ---------------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------------

export async function guardarCampanha(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const title = z.string().trim().min(1, 'De um nome a campanha.').max(120, 'Nome demasiado longo.').parse(form.get('title') ?? '');
    const status = z.enum(ESTADOS as [string, ...string[]]).parse(form.get('status') ?? 'IDEA') as (typeof ESTADOS)[number];
    const channels = form.getAll('channel').map(String).filter((c): c is (typeof CANAIS)[number] => (CANAIS as string[]).includes(c));
    const startsAt = dia(form.get('startsAt'), 'inicio');
    const endsAt = dia(form.get('endsAt'), 'fim');
    if (startsAt && endsAt && endsAt < startsAt) throw new Error('O fim e antes do inicio.');
    const budgetRaw = String(form.get('budget') ?? '').trim();
    const budget = budgetRaw ? parseDecimal(budgetRaw) : null;
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error('Orcamento invalido.');

    const data = {
      title,
      objective: texto(300).parse(form.get('objective') ?? ''),
      description: texto(5000).parse(form.get('description') ?? ''),
      status,
      channels,
      startsAt,
      endsAt,
      budget,
      couponCodes: lerCodigos(String(form.get('couponCodes') ?? '')),
    };
    let alvo = id;
    if (id) {
      await prisma.campaign.update({ where: { id }, data });
    } else {
      const c = await prisma.campaign.create({ data });
      alvo = c.id;
    }
    revalidar(alvo);
    await registar({ quem: eu, acao: id ? 'campanha.alterar' : 'campanha.criar', alvo: title });
    return { ok: true, message: id ? 'Campanha guardada.' : 'Campanha criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** So o estado, com um toque ("A decorrer", "Concluida"). */
export async function mudarEstadoCampanha(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const status = z.enum(ESTADOS as [string, ...string[]]).parse(form.get('status')) as (typeof ESTADOS)[number];
    const c = await prisma.campaign.update({ where: { id }, data: { status } });
    revalidar(id);
    await registar({ quem: eu, acao: 'campanha.estado', alvo: c.title, detalhe: status });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Apaga a campanha e as tarefas dela. */
export async function apagarCampanha(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const c = await prisma.campaign.delete({ where: { id } });
    revalidar();
    await registar({ quem: eu, acao: 'campanha.apagar', alvo: c.title });
    return { ok: true, message: 'Campanha apagada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

export async function guardarTarefa(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const title = z.string().trim().min(1, 'Escreva a tarefa.').max(200, 'Tarefa demasiado longa.').parse(form.get('title') ?? '');
    const data = {
      title,
      notes: texto(2000).parse(form.get('notes') ?? ''),
      assignee: texto(60).parse(form.get('assignee') ?? ''),
      dueAt: dia(form.get('dueAt'), 'prazo'),
    };
    let campaignId: string;
    if (id) {
      const t = await prisma.campaignTask.update({ where: { id }, data });
      campaignId = t.campaignId;
    } else {
      campaignId = String(form.get('campaignId') ?? '');
      const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
      if (!c) throw new Error('Campanha nao encontrada.');
      const ultimo = await prisma.campaignTask.aggregate({ where: { campaignId }, _max: { position: true } });
      await prisma.campaignTask.create({ data: { ...data, campaignId, position: (ultimo._max.position ?? -1) + 1 } });
    }
    revalidar(campaignId);
    await registar({ quem: eu, acao: id ? 'campanha.tarefa.alterar' : 'campanha.tarefa.criar', alvo: title });
    return { ok: true, message: id ? 'Tarefa guardada.' : 'Tarefa juntada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Feita / por fazer, com um toque. */
export async function alternarTarefa(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const t = await prisma.campaignTask.findUniqueOrThrow({ where: { id } });
    await prisma.campaignTask.update({
      where: { id },
      data: { done: !t.done, doneAt: t.done ? null : new Date() },
    });
    revalidar(t.campaignId);
    await registar({ quem: eu, acao: t.done ? 'campanha.tarefa.reabrir' : 'campanha.tarefa.feita', alvo: t.title });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function moverTarefa(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const sentido = form.get('sentido') === 'cima' ? -1 : 1;
    const t = await prisma.campaignTask.findUniqueOrThrow({ where: { id }, select: { campaignId: true } });
    const irmas = await prisma.campaignTask.findMany({
      where: { campaignId: t.campaignId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await trocar(irmas.map((x) => x.id), id, sentido, (tid, position) =>
      prisma.campaignTask.update({ where: { id: tid }, data: { position } }),
    );
    revalidar(t.campaignId);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function apagarTarefa(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const t = await prisma.campaignTask.delete({ where: { id } });
    revalidar(t.campaignId);
    await registar({ quem: eu, acao: 'campanha.tarefa.apagar', alvo: t.title });
    return { ok: true, message: 'Tarefa apagada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Guia
// ---------------------------------------------------------------------------

export async function guardarSecaoGuia(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const title = z.string().trim().min(1, 'De um titulo a secao.').max(120).parse(form.get('title') ?? '');
    const body = z.string().trim().max(10000, 'Texto demasiado longo.').parse(form.get('body') ?? '');
    if (id) {
      await prisma.marketingGuideSection.update({ where: { id }, data: { title, body } });
    } else {
      const ultimo = await prisma.marketingGuideSection.aggregate({ _max: { position: true } });
      await prisma.marketingGuideSection.create({ data: { title, body, position: (ultimo._max.position ?? -1) + 1 } });
    }
    revalidar();
    await registar({ quem: eu, acao: id ? 'guia.alterar' : 'guia.criar', alvo: title });
    return { ok: true, message: id ? 'Guardado.' : 'Secao criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function moverSecaoGuia(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const sentido = form.get('sentido') === 'cima' ? -1 : 1;
    const todas = await prisma.marketingGuideSection.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await trocar(todas.map((x) => x.id), id, sentido, (sid, position) =>
      prisma.marketingGuideSection.update({ where: { id: sid }, data: { position } }),
    );
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function apagarSecaoGuia(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    const id = String(form.get('id') ?? '');
    const s = await prisma.marketingGuideSection.delete({ where: { id } });
    revalidar();
    await registar({ quem: eu, acao: 'guia.apagar', alvo: s.title });
    return { ok: true, message: 'Secao apagada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// O plano de partida
// ---------------------------------------------------------------------------

/**
 * Cria as campanhas, as tarefas e o guia das recomendacoes
 * (`lib/marketing/modelo.ts`). So com o modulo vazio.
 */
export async function comecarComRecomendacoes(_prev: ActionState, _form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirMarketing();
    if ((await prisma.campaign.count()) > 0 || (await prisma.marketingGuideSection.count()) > 0) {
      throw new Error('Ja ha campanhas ou guia: as recomendacoes so se usam com o modulo vazio.');
    }
    const hoje = diaEmLisboa(new Date());
    const col = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
    await prisma.$transaction([
      ...campanhasDoModelo(hoje).map((c, position) =>
        prisma.campaign.create({
          data: {
            title: c.title,
            objective: c.objective,
            description: c.description,
            status: c.status,
            channels: c.channels,
            startsAt: col(c.startsAt),
            endsAt: col(c.endsAt),
            budget: c.budget,
            couponCodes: c.couponCodes,
            position,
            tasks: {
              create: c.tasks.map((t, p) => ({
                title: t.title,
                notes: t.notes ?? null,
                dueAt: t.emDias !== undefined ? col(somarDias(hoje, t.emDias)) : null,
                position: p,
              })),
            },
          },
        }),
      ),
      ...GUIA_DO_MODELO.map((g, position) =>
        prisma.marketingGuideSection.create({ data: { title: g.title, body: g.body, position } }),
      ),
    ]);
    revalidar();
    await registar({ quem: eu, acao: 'marketing.recomendacoes', alvo: 'Plano de partida' });
    return { ok: true, message: 'Campanhas e guia criados. Distribua as tarefas e ajuste as datas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
