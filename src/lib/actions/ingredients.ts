'use server';

/**
 * Mutacoes de insumos, embalagens e fornecedores (Modulo 1).
 *
 * Todas as actions recebem FormData de um `<form action={...}>` nativo, para
 * que as paginas continuem a funcionar sem JavaScript de cliente.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { parseDecimal, parsePercent } from '@/lib/money';
import { baseUnitOf, type PurchaseUnit } from '@/lib/units';
import { fcFromWastePercent } from '@/lib/pricing/cost';
import {
  CATEGORY,
  errorMessage,
  PURCHASE_UNIT,
  QUOTE_SOURCE,
  type ActionState,
} from './shared';

const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'O nome e obrigatorio.'),
  category: CATEGORY,
  supplierId: z.string().trim().optional(),
  purchasePrice: z.number().positive('O preco pago tem de ser maior que zero.'),
  purchaseQty: z.number().positive('A quantidade de compra tem de ser maior que zero.'),
  purchaseUnit: PURCHASE_UNIT,
  correctionFactor: z
    .number()
    .min(1, 'O fator de correcao nao pode ser menor que 1.')
    .max(10, 'Fator de correcao acima de 10 quase sempre e erro de digitacao.'),
  stockBase: z.number().min(0),
  sku: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * O utilizador pode informar a perda de duas maneiras — o FC direto (1,25)
 * ou a percentagem de perda (20%). Aceitamos as duas e convertemos aqui,
 * porque quem limpa carne pensa em "perdi 20%", nao em "FC 1,25".
 */
function readCorrectionFactor(form: FormData): number {
  const mode = String(form.get('fcMode') ?? 'FC');
  if (mode === 'WASTE') {
    const waste = parsePercent(String(form.get('wastePercent') ?? '0'));
    if (waste <= 0) return 1;
    if (waste >= 1) throw new Error('A perda tem de ser menor que 100%.');
    return fcFromWastePercent(waste);
  }
  const fc = parseDecimal(String(form.get('correctionFactor') ?? '1'));
  return fc > 0 ? fc : 1;
}

function readIngredient(form: FormData) {
  return ingredientSchema.parse({
    name: String(form.get('name') ?? ''),
    category: String(form.get('category') ?? 'FOOD'),
    supplierId: String(form.get('supplierId') ?? ''),
    purchasePrice: parseDecimal(String(form.get('purchasePrice') ?? '')),
    purchaseQty: parseDecimal(String(form.get('purchaseQty') ?? '')),
    purchaseUnit: String(form.get('purchaseUnit') ?? 'UN'),
    correctionFactor: readCorrectionFactor(form),
    stockBase: parseDecimal(String(form.get('stockBase') ?? '0')),
    sku: String(form.get('sku') ?? ''),
    notes: String(form.get('notes') ?? ''),
  });
}

export async function saveIngredient(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const data = readIngredient(form);

    const payload = {
      name: data.name,
      category: data.category,
      supplierId: data.supplierId || null,
      purchasePrice: data.purchasePrice,
      purchaseQty: data.purchaseQty,
      purchaseUnit: data.purchaseUnit as PurchaseUnit,
      baseUnit: baseUnitOf(data.purchaseUnit as PurchaseUnit),
      correctionFactor: data.correctionFactor,
      stockBase: data.stockBase,
      sku: data.sku || null,
      notes: data.notes || null,
    };

    if (id) {
      await prisma.ingredient.update({ where: { id }, data: payload });
    } else {
      await prisma.ingredient.create({ data: payload });
    }

    revalidatePath('/insumos');
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: id ? 'Insumo atualizado.' : 'Insumo criado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteIngredient(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = String(form.get('id') ?? '');
  if (!id) return { ok: false, message: 'Insumo nao informado.' };

  try {
    // Apagar um insumo usado numa ficha corromperia o custo dela em silencio.
    const usage = await prisma.recipeItem.count({ where: { ingredientId: id } });
    if (usage > 0) {
      return {
        ok: false,
        message: `Este insumo e usado em ${usage} ficha(s) tecnica(s). Remova-o das fichas primeiro.`,
      };
    }

    await prisma.ingredient.delete({ where: { id } });
    revalidatePath('/insumos');
    revalidatePath('/');
    return { ok: true, message: 'Insumo removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Aplica uma cotacao ao insumo e guarda o historico. */
export async function applyQuote(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    const price = parseDecimal(String(form.get('price') ?? ''));
    const qty = parseDecimal(String(form.get('qty') ?? ''));
    const unit = PURCHASE_UNIT.parse(String(form.get('unit') ?? 'UN'));
    const source = QUOTE_SOURCE.parse(String(form.get('source') ?? 'MANUAL'));

    if (!ingredientId) throw new Error('Insumo nao informado.');
    if (price <= 0 || qty <= 0) {
      throw new Error('Preco e quantidade tem de ser maiores que zero.');
    }

    await prisma.$transaction([
      prisma.priceQuote.create({
        data: {
          ingredientId,
          source,
          label: String(form.get('label') ?? '') || null,
          price,
          qty,
          unit,
          url: String(form.get('url') ?? '') || null,
        },
      }),
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { purchasePrice: price, purchaseQty: qty, purchaseUnit: unit, baseUnit: baseUnitOf(unit) },
      }),
    ]);

    revalidatePath('/insumos');
    revalidatePath('/precificacao');
    revalidatePath('/');
    return { ok: true, message: 'Preco atualizado e registado no historico.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export async function saveSupplier(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('O nome do fornecedor e obrigatorio.');

    const payload = {
      name,
      url: String(form.get('url') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim() || null,
    };

    if (id) {
      await prisma.supplier.update({ where: { id }, data: payload });
    } else {
      await prisma.supplier.create({ data: payload });
    }

    revalidatePath('/fornecedores');
    revalidatePath('/insumos');
    return { ok: true, message: id ? 'Fornecedor atualizado.' : 'Fornecedor criado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteSupplier(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Fornecedor nao informado.');
    // Os insumos ficam sem fornecedor (onDelete: SetNull), nao desaparecem.
    await prisma.supplier.delete({ where: { id } });
    revalidatePath('/fornecedores');
    revalidatePath('/insumos');
    return { ok: true, message: 'Fornecedor removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

