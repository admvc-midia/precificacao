'use server';

/**
 * Montar o cardapio publico: secoes, produtos, combos e o que o link mostra
 * (WhatsApp, Instagram, texto do topo, ligado/desligado). So o dono escreve.
 *
 * Tudo o que muda aqui muda a pagina publica: `revalidar()` expira a cache
 * dela (`TAG_CARDAPIO`) alem das paginas do dono.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { precosDeTabela, TAG_CARDAPIO } from '@/lib/cardapio/consultas';
import { CONTACTOS_DO_PDF, MODELO_DO_PDF } from '@/lib/cardapio/modelo';
import { prisma } from '@/lib/db';
import { apagarFotos, gravarFotos, lerImagem, MAX_FOTO, MAX_MINI } from '@/lib/fotos';
import { num } from '@/lib/mappers';
import { parseDecimal, parseQty } from '@/lib/money';
import { numeroWhatsApp } from '@/lib/pricing/cardapio';
import { lerRede } from '@/lib/pricing/clientes';
import { registar } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

function revalidar() {
  updateTag(TAG_CARDAPIO);
  revalidatePath('/loja/cardapio');
  revalidatePath('/loja/promocoes');
  revalidatePath('/cardapio');
}

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No maximo ${max} caracteres.`)
    .transform((v) => v || null);

/** Checkbox com marcador escondido: desmarcado e ausente nao sao o mesmo. */
function marcado(form: FormData, nome: string, omissao: boolean): boolean {
  return form.has(`${nome}Submitted`) ? form.get(nome) === 'on' : omissao;
}

function preco(raw: FormDataEntryValue | null, obrigatorio: boolean): number | null {
  const s = String(raw ?? '').trim();
  if (!s) {
    if (obrigatorio) throw new Error('Indique o preco.');
    return null;
  }
  const v = parseDecimal(s);
  if (!Number.isFinite(v) || v < 0) throw new Error('Preco invalido.');
  if (v > 10_000) throw new Error('Preco alto demais: confira a virgula.');
  return v;
}

async function proximaPosicao(sectionId: string | null): Promise<number> {
  const ultimo = await prisma.menuItem.aggregate({ where: { sectionId }, _max: { position: true } });
  return (ultimo._max.position ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// O link publico
// ---------------------------------------------------------------------------

export async function guardarDefinicoesDoCardapio(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const data: Record<string, unknown> = {};
    // Como nas configuracoes: so muda o que o formulario trouxe.
    if (form.has('whatsappNumber')) {
      const raw = String(form.get('whatsappNumber')).trim();
      const n = numeroWhatsApp(raw);
      if (raw && !n) throw new Error('Numero de WhatsApp invalido: escreva-o com o indicativo, por exemplo +351 924 005 977.');
      data.whatsappNumber = n;
    }
    if (form.has('instagramHandle')) data.instagramHandle = lerRede('instagram', String(form.get('instagramHandle')));
    if (form.has('facebookHandle')) data.facebookHandle = lerRede('facebook', String(form.get('facebookHandle')));
    if (form.has('menuIntro')) data.menuIntro = texto(500).parse(form.get('menuIntro'));
    if (form.has('menuPublishedSubmitted')) data.menuPublished = form.get('menuPublished') === 'on';

    await prisma.settings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
    revalidar();
    await registar({
      quem: eu,
      acao: 'cardapio.definicoes',
      alvo: 'Cardapio publico',
      detalhe: 'menuPublished' in data ? (data.menuPublished ? 'publicado' : 'desligado') : undefined,
    });
    return { ok: true, message: 'Guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Secoes
// ---------------------------------------------------------------------------

const SECAO = z.object({
  name: z.string().trim().min(1, 'De um nome a secao.').max(80, 'Nome demasiado longo.'),
  layout: z.enum(['LIST', 'CARDS', 'TEXT', 'GALLERY']),
  description: texto(2000),
  itemsTitle: texto(80),
  footnote: texto(500),
  highlight: texto(200),
  body: texto(5000),
});

export async function guardarSecao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const d = SECAO.parse({
      name: form.get('name') ?? '',
      layout: form.get('layout') ?? 'LIST',
      description: form.get('description') ?? '',
      itemsTitle: form.get('itemsTitle') ?? '',
      footnote: form.get('footnote') ?? '',
      highlight: form.get('highlight') ?? '',
      body: form.get('body') ?? '',
    });
    const published = marcado(form, 'published', true);
    if (id) {
      await prisma.menuSection.update({ where: { id }, data: { ...d, published } });
    } else {
      const ultimo = await prisma.menuSection.aggregate({ _max: { position: true } });
      await prisma.menuSection.create({ data: { ...d, published, position: (ultimo._max.position ?? -1) + 1 } });
    }
    revalidar();
    await registar({ quem: eu, acao: id ? 'cardapio.secao.alterar' : 'cardapio.secao.criar', alvo: d.name });
    return { ok: true, message: id ? 'Secao guardada.' : 'Secao criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Apaga a secao; os itens dela ficam "sem secao", nao se perdem. */
export async function apagarSecao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const s = await prisma.menuSection.delete({ where: { id } });
    await apagarFotos([s.photoPath, s.photoThumbPath]);
    revalidar();
    await registar({ quem: eu, acao: 'cardapio.secao.apagar', alvo: s.name });
    return { ok: true, message: 'Secao apagada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Troca a secao de lugar com a vizinha de cima ou de baixo. */
export async function moverSecao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    const sentido = form.get('sentido') === 'cima' ? -1 : 1;
    const todas = await prisma.menuSection.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true } });
    await trocar(todas.map((s) => s.id), id, sentido, (sid, position) =>
      prisma.menuSection.update({ where: { id: sid }, data: { position } }),
    );
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Renumera a lista (0, 1, 2...) com o item trocado de lugar. Renumerar tudo
 * resolve tambem posicoes repetidas, que as linhas antigas podem ter.
 */
async function trocar(
  ids: string[],
  id: string,
  sentido: number,
  gravar: (id: string, position: number) => Promise<unknown>,
) {
  const i = ids.indexOf(id);
  const j = i + sentido;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await prisma.$transaction(ids.map((x, pos) => gravar(x, pos) as never));
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

/**
 * A ficha de um produto do cardapio: tem de ser um produto final e nao estar
 * ja noutro item. Vazio = item sem ficha (so nome e preco): aparece no link
 * publico, mas so entra nas encomendas depois de ligado a uma ficha.
 */
async function fichaDoItem(recipeId: string, itemId?: string): Promise<{ name: string } | null> {
  if (!recipeId) return null;
  const ficha = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { name: true, kind: true } });
  if (!ficha) throw new Error('Ficha nao encontrada.');
  if (ficha.kind !== 'PRODUCT') throw new Error('So produtos finais vao para o cardapio.');
  const outro = await prisma.menuItem.findUnique({ where: { recipeId }, select: { id: true } });
  if (outro && outro.id !== itemId) throw new Error(`${ficha.name} ja esta noutro item do cardapio.`);
  return ficha;
}

/** Junta um produto ao cardapio: uma ficha (preco de tabela por omissao) ou so um nome. */
export async function adicionarProduto(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const recipeId = String(form.get('recipeId') ?? '');
    const sectionId = String(form.get('sectionId') ?? '') || null;
    const ficha = await fichaDoItem(recipeId);
    const name = texto(120).parse(form.get('name') ?? '');
    if (!ficha && !name) throw new Error('Escolha a ficha, ou escreva o nome do produto.');

    let price = preco(form.get('price'), false);
    if (price == null) {
      price = ficha ? ((await precosDeTabela()).get(recipeId) ?? null) : null;
      if (price == null) throw new Error(`${ficha?.name ?? name} nao tem preco de tabela: escreva o preco.`);
    }
    await prisma.menuItem.create({
      data: {
        kind: 'PRODUCT',
        recipeId: recipeId || null,
        // Com ficha, o nome vazio usa o da ficha.
        name,
        description: texto(1000).parse(form.get('description') ?? ''),
        sectionId,
        price,
        unitLabel: texto(80).parse(form.get('unitLabel') ?? ''),
        position: await proximaPosicao(sectionId),
      },
    });
    revalidar();
    const alvo = name ?? ficha!.name;
    await registar({ quem: eu, acao: 'cardapio.item.criar', alvo, detalhe: `preco ${price.toFixed(2)}` });
    return { ok: true, message: `${alvo} juntou-se ao cardapio (ainda por publicar).` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Cria as secoes e os textos do menu em PDF (`lib/cardapio/modelo.ts`), com
 * os itens publicados mas sem ficha. So quando o cardapio esta vazio; o link
 * continua desligado ate o dono o ligar. Preenche o WhatsApp e o Instagram
 * do PDF se ainda estiverem vazios.
 */
export async function comecarComModelo(_prev: ActionState, _form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    if ((await prisma.menuSection.count()) > 0 || (await prisma.menuItem.count()) > 0) {
      throw new Error('O cardapio ja tem secoes ou itens: o modelo so se usa num cardapio vazio.');
    }
    const atual = await prisma.settings.findUnique({ where: { id: 'default' } });
    await prisma.$transaction([
      ...MODELO_DO_PDF.map((s, position) =>
        prisma.menuSection.create({
          data: {
            name: s.name,
            layout: s.layout,
            position,
            description: s.description ?? null,
            itemsTitle: s.itemsTitle ?? null,
            footnote: s.footnote ?? null,
            highlight: s.highlight ?? null,
            body: s.body ?? null,
            items: {
              create: (s.itens ?? []).map((i, p) => ({
                kind: 'PRODUCT' as const,
                name: i.name,
                description: i.description ?? null,
                unitLabel: i.unitLabel ?? null,
                price: i.price,
                published: true,
                position: p,
              })),
            },
          },
        }),
      ),
      prisma.settings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...CONTACTOS_DO_PDF },
        update: {
          whatsappNumber: atual?.whatsappNumber || CONTACTOS_DO_PDF.whatsappNumber,
          instagramHandle: atual?.instagramHandle || CONTACTOS_DO_PDF.instagramHandle,
        },
      }),
    ]);
    revalidar();
    await registar({ quem: eu, acao: 'cardapio.modelo', alvo: 'Menu Bolos.pdf' });
    return { ok: true, message: 'Cardapio criado a partir do PDF. Reveja os textos e ligue cada item a sua ficha.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Le as linhas do combo: `comp.<n>.recipeId` e `comp.<n>.qty`. */
function lerComponentes(form: FormData): Array<{ recipeId: string; qty: number }> {
  const indices = new Set<string>();
  for (const k of form.keys()) {
    const m = /^comp\.(\d+)\.recipeId$/.exec(k);
    if (m) indices.add(m[1]);
  }
  const out = new Map<string, number>();
  for (const i of [...indices].sort((a, b) => Number(a) - Number(b))) {
    const recipeId = String(form.get(`comp.${i}.recipeId`) ?? '').trim();
    if (!recipeId) continue;
    const qty = parseQty(String(form.get(`comp.${i}.qty`) ?? ''));
    if (!(qty > 0)) throw new Error('Cada produto do combo precisa de uma quantidade.');
    // A mesma ficha duas vezes soma.
    out.set(recipeId, (out.get(recipeId) ?? 0) + qty);
  }
  return [...out].map(([recipeId, qty]) => ({ recipeId, qty }));
}

export async function guardarCombo(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const name = z.string().trim().min(1, 'De um nome ao combo.').max(120).parse(form.get('name') ?? '');
    const comps = lerComponentes(form);
    if (comps.length === 0) throw new Error('Escolha pelo menos um produto para o combo.');
    const fichas = await prisma.recipe.findMany({ where: { id: { in: comps.map((c) => c.recipeId) } }, select: { id: true, kind: true } });
    if (fichas.length !== comps.length || fichas.some((f) => f.kind !== 'PRODUCT')) {
      throw new Error('O combo so pode levar produtos finais.');
    }
    const price = preco(form.get('price'), true)!;
    const sectionId = String(form.get('sectionId') ?? '') || null;
    const comuns = {
      name,
      description: texto(1000).parse(form.get('description') ?? ''),
      unitLabel: texto(80).parse(form.get('unitLabel') ?? ''),
      sectionId,
    };

    if (id) {
      const atual = await prisma.menuItem.findUniqueOrThrow({ where: { id } });
      if (atual.kind !== 'COMBO') throw new Error('Este item nao e um combo.');
      await prisma.$transaction([
        prisma.menuComboItem.deleteMany({ where: { comboId: id } }),
        prisma.menuItem.update({
          where: { id },
          data: {
            ...comuns,
            price,
            published: marcado(form, 'published', atual.published),
            soldOut: marcado(form, 'soldOut', atual.soldOut),
            ...(num(atual.price) !== price ? { priceSetAt: new Date() } : {}),
            components: { create: comps },
          },
        }),
      ]);
    } else {
      await prisma.menuItem.create({
        data: { ...comuns, kind: 'COMBO', price, position: await proximaPosicao(sectionId), components: { create: comps } },
      });
    }
    revalidar();
    await registar({ quem: eu, acao: id ? 'cardapio.combo.alterar' : 'cardapio.combo.criar', alvo: name, detalhe: `preco ${price.toFixed(2)}` });
    return { ok: true, message: id ? 'Combo guardado.' : 'Combo criado (ainda por publicar).' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Nome, descricao, unidade, preco, secao e os interruptores de um item. */
export async function guardarItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const atual = await prisma.menuItem.findUnique({ where: { id }, include: { recipe: { select: { name: true } } } });
    if (!atual) throw new Error('Item nao encontrado.');
    const price = preco(form.get('price'), true)!;
    const sectionId = form.has('sectionId') ? String(form.get('sectionId')) || null : atual.sectionId;
    const name = texto(120).parse(form.get('name') ?? '');
    if (atual.kind === 'COMBO' && !name) throw new Error('O combo precisa de nome.');

    // Ligar, trocar ou desligar a ficha (so produtos; o campo pode nao vir).
    let recipeId = atual.recipeId;
    if (atual.kind === 'PRODUCT' && form.has('recipeId')) {
      recipeId = String(form.get('recipeId')) || null;
      await fichaDoItem(recipeId ?? '', id);
      if (!recipeId && !name) throw new Error('Sem ficha, o item precisa de nome.');
    }

    await prisma.menuItem.update({
      where: { id },
      data: {
        recipeId,
        name,
        description: texto(1000).parse(form.get('description') ?? ''),
        unitLabel: texto(80).parse(form.get('unitLabel') ?? ''),
        price,
        ...(num(atual.price) !== price ? { priceSetAt: new Date() } : {}),
        priceOnRequest: marcado(form, 'priceOnRequest', atual.priceOnRequest),
        published: marcado(form, 'published', atual.published),
        soldOut: marcado(form, 'soldOut', atual.soldOut),
        ...(sectionId !== atual.sectionId ? { sectionId, position: await proximaPosicao(sectionId) } : {}),
      },
    });
    revalidar();
    await registar({ quem: eu, acao: 'cardapio.item.alterar', alvo: name ?? atual.recipe?.name ?? id, detalhe: `preco ${price.toFixed(2)}` });
    return { ok: true, message: 'Guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Um toque: publicar/esconder ou esgotado/disponivel. */
export async function alternarItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const campo = z.enum(['published', 'soldOut']).parse(form.get('campo'));
    const atual = await prisma.menuItem.findUniqueOrThrow({ where: { id }, include: { recipe: { select: { name: true } } } });
    const novo = !atual[campo];
    await prisma.menuItem.update({ where: { id }, data: { [campo]: novo } });
    revalidar();
    await registar({
      quem: eu,
      acao: `cardapio.item.${campo === 'published' ? (novo ? 'publicar' : 'esconder') : novo ? 'esgotar' : 'repor'}`,
      alvo: atual.name ?? atual.recipe?.name ?? id,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Poe o preco publicado igual ao de tabela de hoje. */
export async function usarPrecoDeTabela(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const atual = await prisma.menuItem.findUniqueOrThrow({ where: { id }, include: { recipe: { select: { name: true } } } });
    if (!atual.recipeId) throw new Error('Um combo nao tem preco de tabela.');
    const tabela = (await precosDeTabela()).get(atual.recipeId);
    if (tabela == null) throw new Error('Esta ficha nao tem preco de tabela.');
    await prisma.menuItem.update({ where: { id }, data: { price: tabela, priceSetAt: new Date() } });
    revalidar();
    await registar({ quem: eu, acao: 'cardapio.item.preco-tabela', alvo: atual.recipe?.name ?? id, detalhe: `${num(atual.price).toFixed(2)} → ${tabela.toFixed(2)}` });
    return { ok: true, message: 'Preco atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function moverItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirDono();
    const id = String(form.get('id') ?? '');
    const sentido = form.get('sentido') === 'cima' ? -1 : 1;
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { id }, select: { sectionId: true } });
    const irmaos = await prisma.menuItem.findMany({
      where: { sectionId: item.sectionId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await trocar(irmaos.map((s) => s.id), id, sentido, (iid, position) =>
      prisma.menuItem.update({ where: { id: iid }, data: { position } }),
    );
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Tira o item do cardapio. As encomendas que o usaram ficam com as linhas
 * (so perdem a ligacao ao item); as promocoes deixam de o incluir.
 */
export async function apagarItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const atual = await prisma.menuItem.delete({ where: { id }, include: { recipe: { select: { name: true } } } });
    // So a foto propria; a da ficha e da ficha.
    await apagarFotos([atual.photoPath, atual.photoThumbPath]);
    revalidar();
    await registar({ quem: eu, acao: 'cardapio.item.apagar', alvo: atual.name ?? atual.recipe?.name ?? id });
    return { ok: true, message: 'Tirado do cardapio.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Fotos (do item e da capa da secao)
// ---------------------------------------------------------------------------
//
// Como as das fichas (`actions/photos.ts`): o telemovel manda a foto ja
// reduzida e a miniatura; grava-se a nova, aponta-se para ela, e so depois se
// apaga a antiga. Pasta `cardapio/` no Blob.

type Alvo = 'item' | 'secao';

async function fotoAtual(alvo: Alvo, id: string) {
  const sel = { photoPath: true, photoThumbPath: true } as const;
  const r =
    alvo === 'item'
      ? await prisma.menuItem.findUnique({ where: { id }, select: sel })
      : await prisma.menuSection.findUnique({ where: { id }, select: sel });
  if (!r) throw new Error(alvo === 'item' ? 'Item nao encontrado.' : 'Secao nao encontrada.');
  return r;
}

async function apontar(alvo: Alvo, id: string, data: { photoPath: string | null; photoThumbPath: string | null }) {
  if (alvo === 'item') await prisma.menuItem.update({ where: { id }, data });
  else await prisma.menuSection.update({ where: { id }, data });
}

async function guardarFoto(alvo: Alvo, form: FormData): Promise<ActionState> {
  let novos: { photoPath: string; photoThumbPath: string } | null = null;
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const atual = await fotoAtual(alvo, id);
    const foto = await lerImagem(form.get('foto'), MAX_FOTO, 'foto');
    const mini = await lerImagem(form.get('mini'), MAX_MINI, 'miniatura');

    novos = await gravarFotos(id, foto, mini, 'cardapio');
    await apontar(alvo, id, novos);
    await apagarFotos([atual.photoPath, atual.photoThumbPath]);

    revalidar();
    await registar({ quem: eu, acao: `cardapio.${alvo}.foto`, alvo: id });
    return { ok: true, message: atual.photoPath ? 'Foto trocada.' : 'Foto guardada.' };
  } catch (err) {
    // Gravou no Blob mas nada ficou a apontar: nao deixar o ficheiro orfao.
    if (novos) await apagarFotos([novos.photoPath, novos.photoThumbPath]);
    return { ok: false, message: errorMessage(err) };
  }
}

async function tirarFoto(alvo: Alvo, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const atual = await fotoAtual(alvo, id);
    await apontar(alvo, id, { photoPath: null, photoThumbPath: null });
    await apagarFotos([atual.photoPath, atual.photoThumbPath]);
    revalidar();
    await registar({ quem: eu, acao: `cardapio.${alvo}.tirar-foto`, alvo: id });
    return { ok: true, message: 'Foto removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function guardarFotoItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guardarFoto('item', form);
}

export async function tirarFotoItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return tirarFoto('item', form);
}

export async function guardarFotoSecao(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guardarFoto('secao', form);
}

export async function tirarFotoSecao(_prev: ActionState, form: FormData): Promise<ActionState> {
  return tirarFoto('secao', form);
}
