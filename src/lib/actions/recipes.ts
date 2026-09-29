'use server';

/**
 * Mutacoes de fichas tecnicas (Modulo 2) e dos parametros de preco por
 * produto (Modulo 3).
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { parseDecimal, parsePercent } from '@/lib/money';
import { buildCostContext } from '@/lib/mappers';
import { computeRecipeCost } from '@/lib/pricing/cost';
import {
  BASE_UNIT,
  errorMessage,
  PRICING_MODE,
  PURCHASE_UNIT,
  RECIPE_KIND,
  type ActionState,
} from './shared';


export async function saveRecipe(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('O nome da ficha e obrigatorio.');

    const kind = RECIPE_KIND.parse(String(form.get('kind') ?? 'PRODUCT'));
    const yieldQty = parseDecimal(String(form.get('yieldQty') ?? '1'));
    if (yieldQty <= 0) throw new Error('O rendimento tem de ser maior que zero.');

    // Um produto final rende porcoes; uma base rende peso ou volume.
    const yieldUnit = kind === 'PRODUCT'
      ? 'UN'
      : BASE_UNIT.parse(String(form.get('yieldUnit') ?? 'G'));

    const payload = {
      name,
      kind,
      description: String(form.get('description') ?? '').trim() || null,
      yieldQty,
      yieldUnit,
      packagingId: String(form.get('packagingId') ?? '') || null,
      deliveryPackagingId: String(form.get('deliveryPackagingId') ?? '') || null,
    };

    const recipe = id
      ? await prisma.recipe.update({ where: { id }, data: payload })
      : await prisma.recipe.create({ data: payload });

    revalidatePath('/fichas');
    revalidatePath(`/fichas/${recipe.id}`);
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: id ? 'Ficha atualizada.' : 'Ficha criada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteRecipe(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Ficha nao informada.');

    const usage = await prisma.recipeItem.count({ where: { childRecipeId: id } });
    if (usage > 0) {
      return {
        ok: false,
        message: `Esta preparacao e usada em ${usage} ficha(s). Remova-a delas primeiro.`,
      };
    }

    await prisma.recipe.delete({ where: { id } });
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Ficha removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Adiciona um insumo ou uma sub-receita a ficha.
 *
 * A validacao importante acontece depois da escrita: recalculamos o custo e,
 * se a linha tiver criado um ciclo (A usa B, B usa A), desfazemos. Deixar o
 * ciclo entrar tornaria a ficha impossivel de calcular e dificil de arrumar.
 */
export async function addRecipeItem(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let createdId: string | null = null;
  try {
    const recipeId = String(form.get('recipeId') ?? '');
    if (!recipeId) throw new Error('Ficha nao informada.');

    const ref = String(form.get('ref') ?? '');
    const qty = parseDecimal(String(form.get('qty') ?? ''));
    const unit = PURCHASE_UNIT.parse(String(form.get('unit') ?? 'G'));
    if (qty <= 0) throw new Error('A quantidade tem de ser maior que zero.');

    // O select combina insumos e sub-receitas: "ING:<id>" ou "REC:<id>".
    const [type, refId] = ref.split(':');
    if (!refId) throw new Error('Escolha um insumo ou preparacao.');
    if (type === 'REC' && refId === recipeId) {
      throw new Error('Uma ficha nao pode conter ela mesma.');
    }

    const last = await prisma.recipeItem.findFirst({
      where: { recipeId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await prisma.recipeItem.create({
      data: {
        recipeId,
        ingredientId: type === 'ING' ? refId : null,
        childRecipeId: type === 'REC' ? refId : null,
        qty,
        unit,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    createdId = created.id;

    await assertRecipeIsComputable(recipeId);

    revalidatePath(`/fichas/${recipeId}`);
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Linha adicionada.' };
  } catch (err) {
    if (createdId) {
      await prisma.recipeItem.delete({ where: { id: createdId } }).catch(() => {});
    }
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Altera a quantidade ou a unidade de uma linha da ficha.
 *
 * Como no `addRecipeItem`, a validacao acontece depois da escrita: se a
 * alteracao tornar a ficha impossivel de calcular (unidade de outra familia,
 * por exemplo), repomos os valores anteriores.
 */
export async function updateRecipeItem(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = String(form.get('id') ?? '');
  let previous: { qty: number; unit: 'KG' | 'G' | 'L' | 'ML' | 'UN' } | null = null;

  try {
    if (!id) throw new Error('Linha nao informada.');

    const qty = parseDecimal(String(form.get('qty') ?? ''));
    const unit = PURCHASE_UNIT.parse(String(form.get('unit') ?? 'G'));
    if (qty <= 0) throw new Error('A quantidade tem de ser maior que zero.');

    const current = await prisma.recipeItem.findUnique({ where: { id } });
    if (!current) throw new Error('Linha nao encontrada.');
    previous = { qty: Number(current.qty), unit: current.unit };

    await prisma.recipeItem.update({
      where: { id },
      data: { qty, unit, notes: String(form.get('notes') ?? '').trim() || null },
    });

    await assertRecipeIsComputable(current.recipeId);

    revalidatePath(`/fichas/${current.recipeId}`);
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath(`/precificacao/${current.recipeId}`);
    revalidatePath('/');
    return { ok: true, message: 'Linha atualizada.' };
  } catch (err) {
    if (previous && id) {
      await prisma.recipeItem
        .update({ where: { id }, data: previous })
        .catch(() => {});
    }
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteRecipeItem(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const recipeId = String(form.get('recipeId') ?? '');
    if (!id) throw new Error('Linha nao informada.');

    await prisma.recipeItem.delete({ where: { id } });

    revalidatePath(`/fichas/${recipeId}`);
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Linha removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Modo de preco e alvos por produto (sobrescrevem as configuracoes globais). */
export async function saveRecipePricing(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Ficha nao informada.');

    const mode = PRICING_MODE.parse(String(form.get('pricingMode') ?? 'TARGET_CMV'));
    const manualRaw = String(form.get('manualPrice') ?? '').trim();
    const cmvRaw = String(form.get('targetCmv') ?? '').trim();
    const marginRaw = String(form.get('targetMargin') ?? '').trim();

    const manualPrice = manualRaw ? parseDecimal(manualRaw) : null;
    if (mode === 'MANUAL' && (manualPrice === null || manualPrice <= 0)) {
      throw new Error('No modo manual e preciso informar um preco maior que zero.');
    }

    // Vazio significa "usar o valor global", nao "zero".
    const targetCmv = cmvRaw ? parsePercent(cmvRaw) : null;
    const targetMargin = marginRaw ? parsePercent(marginRaw) : null;

    if (targetCmv !== null && (targetCmv <= 0 || targetCmv >= 1)) {
      throw new Error('O CMV alvo tem de estar entre 0% e 100%.');
    }
    if (targetMargin !== null && (targetMargin < 0 || targetMargin >= 1)) {
      throw new Error('A margem alvo tem de estar entre 0% e 100%.');
    }

    await prisma.recipe.update({
      where: { id },
      data: { pricingMode: mode, manualPrice, targetCmv, targetMargin },
    });

    revalidatePath(`/precificacao/${id}`);
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Precificacao atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Recalcula a ficha e propaga o erro do motor (ciclo, unidade incompativel,
 * insumo em falta) para quem chamou.
 */
async function assertRecipeIsComputable(recipeId: string): Promise<void> {
  const [ingredients, recipes] = await Promise.all([
    prisma.ingredient.findMany(),
    prisma.recipe.findMany({ include: { items: true } }),
  ]);
  computeRecipeCost(recipeId, buildCostContext(ingredients, recipes));
}
