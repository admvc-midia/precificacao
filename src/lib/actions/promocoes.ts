'use server';

/**
 * Promocoes (sobre itens do cardapio) e cupoes de desconto (sobre fichas,
 * validados na encomenda). So o dono escreve.
 *
 * Os valores em dinheiro estao na convencao de IVA das configuracoes, como o
 * preco do cardapio. As datas sao dias de Lisboa, ambos incluidos.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { TAG_CARDAPIO } from '@/lib/cardapio/consultas';
import { prisma } from '@/lib/db';
import { parseDecimal, parsePercent, parseQty } from '@/lib/money';
import { CODIGO_VALIDO, normalizarCodigo, problemaNaPromocao } from '@/lib/pricing/cardapio';
import { registar } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function dia(raw: FormDataEntryValue | null, obrigatorio: boolean, nome: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) {
    if (obrigatorio) throw new Error(`Escolha a data de ${nome}.`);
    return null;
  }
  if (!DIA.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error(`Data de ${nome} invalida.`);
  return s;
}

const coluna = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

function inteiro(raw: FormDataEntryValue | null, nome: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const v = Number(s);
  if (!Number.isInteger(v) || v < 0) throw new Error(`${nome}: escreva um numero inteiro.`);
  return v;
}

function dinheiro(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const v = parseDecimal(s);
  if (!Number.isFinite(v) || v < 0) throw new Error('Valor invalido.');
  return v;
}

function marcado(form: FormData, nome: string, omissao: boolean): boolean {
  return form.has(`${nome}Submitted`) ? form.get(nome) === 'on' : omissao;
}

// ---------------------------------------------------------------------------
// Promocoes
// ---------------------------------------------------------------------------

function revalidarPromocoes() {
  updateTag(TAG_CARDAPIO);
  revalidatePath('/loja/promocoes');
  revalidatePath('/loja/cardapio');
  revalidatePath('/cardapio');
  revalidatePath('/encomendas/nova');
}

export async function guardarPromocao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const name = z.string().trim().min(1, 'De um nome a promocao.').max(80, 'Nome demasiado longo.').parse(form.get('name') ?? '');
    const kind = z.enum(['PERCENT', 'AMOUNT', 'BUY_X_PAY_Y', 'QTY_PRICE']).parse(form.get('kind'));
    const startsAt = dia(form.get('startsAt'), true, 'inicio')!;
    const endsAt = dia(form.get('endsAt'), false, 'fim');

    // So os campos do tipo escolhido contam; os outros ficam nulos, para uma
    // promocao que mudou de tipo nao guardar restos do anterior.
    const valueRaw = String(form.get('value') ?? '').trim();
    const value =
      kind === 'PERCENT' ? (valueRaw ? parsePercent(valueRaw) : null)
      : kind === 'AMOUNT' || kind === 'QTY_PRICE' ? dinheiro(valueRaw)
      : null;
    const buyQty = kind === 'BUY_X_PAY_Y' ? inteiro(form.get('buyQty'), 'Leve') : null;
    const payQty = kind === 'BUY_X_PAY_Y' ? inteiro(form.get('payQty'), 'Pague') : null;
    const minQtyRaw = String(form.get('minQty') ?? '').trim();
    const minQty = kind === 'QTY_PRICE' && minQtyRaw ? parseQty(minQtyRaw) : null;

    const problema = problemaNaPromocao({ kind, value, buyQty, payQty, minQty, startsAt, endsAt });
    if (problema) throw new Error(problema);

    const menuItemIds = [...new Set(form.getAll('menuItemId').map(String).filter(Boolean))];
    if (menuItemIds.length === 0) throw new Error('Escolha pelo menos um item do cardapio.');
    const existentes = await prisma.menuItem.count({ where: { id: { in: menuItemIds } } });
    if (existentes !== menuItemIds.length) throw new Error('Um dos itens ja nao esta no cardapio.');

    const data = {
      name,
      kind,
      value,
      buyQty,
      payQty,
      minQty,
      startsAt: coluna(startsAt)!,
      endsAt: coluna(endsAt),
      active: marcado(form, 'active', true),
    };
    const items = { create: menuItemIds.map((menuItemId) => ({ menuItemId })) };
    if (id) {
      await prisma.$transaction([
        prisma.promotionItem.deleteMany({ where: { promotionId: id } }),
        prisma.promotion.update({ where: { id }, data: { ...data, items } }),
      ]);
    } else {
      await prisma.promotion.create({ data: { ...data, items } });
    }
    revalidarPromocoes();
    await registar({
      quem: eu,
      acao: id ? 'promocao.alterar' : 'promocao.criar',
      alvo: name,
      detalhe: `${startsAt}${endsAt ? ` a ${endsAt}` : ''}, ${menuItemIds.length} item(ns)`,
    });
    return { ok: true, message: id ? 'Promocao guardada.' : 'Promocao criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function alternarPromocao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const p = await prisma.promotion.findUniqueOrThrow({ where: { id } });
    await prisma.promotion.update({ where: { id }, data: { active: !p.active } });
    revalidarPromocoes();
    await registar({ quem: eu, acao: p.active ? 'promocao.desligar' : 'promocao.ligar', alvo: p.name });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** As encomendas que a usaram ficam com o preco; so perdem a ligacao. */
export async function apagarPromocao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const p = await prisma.promotion.delete({ where: { id } });
    revalidarPromocoes();
    await registar({ quem: eu, acao: 'promocao.apagar', alvo: p.name });
    return { ok: true, message: 'Promocao apagada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Cupoes
// ---------------------------------------------------------------------------

function revalidarCupoes() {
  revalidatePath('/loja/cupoes');
  revalidatePath('/encomendas/nova');
}

export async function guardarCupao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const code = normalizarCodigo(String(form.get('code') ?? ''));
    if (!CODIGO_VALIDO.test(code)) {
      throw new Error('Codigo invalido: de 2 a 30 letras ou numeros (pode ter - e _), sem espacos.');
    }
    const kind = z.enum(['PERCENT', 'AMOUNT']).parse(form.get('kind'));
    const valueRaw = String(form.get('value') ?? '').trim();
    const value = kind === 'PERCENT' ? parsePercent(valueRaw) : parseDecimal(valueRaw);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Indique o desconto.');
    if (kind === 'PERCENT' && value >= 1) throw new Error('A percentagem tem de ser menor que 100%.');

    const startsAt = dia(form.get('startsAt'), true, 'inicio')!;
    const endsAt = dia(form.get('endsAt'), false, 'fim');
    if (endsAt && endsAt < startsAt) throw new Error('O fim e antes do inicio.');

    const maxUses = inteiro(form.get('maxUses'), 'Usos no total');
    const maxUsesPerCustomer = inteiro(form.get('maxUsesPerCustomer'), 'Usos por cliente');
    if (maxUses === 0 || maxUsesPerCustomer === 0) throw new Error('Um limite de 0 usos nao deixa usar o cupao: deixe vazio para sem limite.');

    const allItems = form.get('scope') !== 'lista';
    const recipeIds = allItems ? [] : [...new Set(form.getAll('recipeId').map(String).filter(Boolean))];
    if (!allItems && recipeIds.length === 0) throw new Error('Escolha os produtos a que o cupao se aplica.');

    const data = {
      code,
      description: z.string().trim().max(200).transform((v) => v || null).parse(form.get('description') ?? ''),
      kind,
      value,
      minOrder: dinheiro(form.get('minOrder')),
      startsAt: coluna(startsAt)!,
      endsAt: coluna(endsAt),
      maxUses,
      maxUsesPerCustomer,
      allItems,
      stacksWithPromotions: marcado(form, 'stacksWithPromotions', false),
      active: marcado(form, 'active', true),
    };
    const recipes = { create: recipeIds.map((recipeId) => ({ recipeId })) };
    if (id) {
      await prisma.$transaction([
        prisma.couponRecipe.deleteMany({ where: { couponId: id } }),
        prisma.coupon.update({ where: { id }, data: { ...data, recipes } }),
      ]);
    } else {
      if (await prisma.coupon.findUnique({ where: { code } })) throw new Error(`Ja existe um cupao ${code}.`);
      await prisma.coupon.create({ data: { ...data, recipes } });
    }
    revalidarCupoes();
    await registar({ quem: eu, acao: id ? 'cupao.alterar' : 'cupao.criar', alvo: code });
    return { ok: true, message: id ? 'Cupao guardado.' : `Cupao ${code} criado.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function alternarCupao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const c = await prisma.coupon.findUniqueOrThrow({ where: { id } });
    await prisma.coupon.update({ where: { id }, data: { active: !c.active } });
    revalidarCupoes();
    await registar({ quem: eu, acao: c.active ? 'cupao.desligar' : 'cupao.ligar', alvo: c.code });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Apaga o cupao. As encomendas que o usaram guardam o codigo e o desconto
 * (`couponCode`, `couponDiscount`); so perdem a ligacao.
 */
export async function apagarCupao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = String(form.get('id') ?? '');
    const c = await prisma.coupon.delete({ where: { id } });
    revalidarCupoes();
    await registar({ quem: eu, acao: 'cupao.apagar', alvo: c.code });
    return { ok: true, message: 'Cupao apagado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
