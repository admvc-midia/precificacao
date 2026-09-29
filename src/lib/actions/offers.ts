'use server';

/** Precos de um insumo em cada fornecedor. */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { parseDecimal } from '@/lib/money';
import { baseUnitOf, type PurchaseUnit } from '@/lib/units';
import { errorMessage, PURCHASE_UNIT, type ActionState } from './shared';

function revalidar() {
  revalidatePath('/insumos');
  revalidatePath('/producao');
  revalidatePath('/fornecedores');
}

export async function saveOffer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    const supplierId = String(form.get('supplierId') ?? '');
    if (!ingredientId) throw new Error('Insumo nao informado.');
    if (!supplierId) throw new Error('Escolha um fornecedor.');

    const purchasePrice = parseDecimal(String(form.get('purchasePrice') ?? ''));
    const purchaseQty = parseDecimal(String(form.get('purchaseQty') ?? ''));
    const purchaseUnit = PURCHASE_UNIT.parse(String(form.get('purchaseUnit') ?? 'KG'));

    if (purchasePrice <= 0) throw new Error('O preco tem de ser maior que zero.');
    if (purchaseQty <= 0) throw new Error('A quantidade tem de ser maior que zero.');

    const insumo = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { baseUnit: true, name: true },
    });
    if (!insumo) throw new Error('Insumo nao encontrado.');

    // Comparar precos exige a mesma familia de unidades: nao ha como pesar
    // um preco por litro contra um preco por quilo.
    if (baseUnitOf(purchaseUnit as PurchaseUnit) !== insumo.baseUnit) {
      throw new Error(
        `"${insumo.name}" mede-se em ${insumo.baseUnit === 'UN' ? 'unidades' : insumo.baseUnit.toLowerCase()}. Escolha uma unidade dessa familia para os precos poderem ser comparados.`,
      );
    }

    const preferred = form.get('preferred') === 'on';

    const dados = {
      purchasePrice,
      purchaseQty,
      purchaseUnit,
      sku: String(form.get('sku') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim() || null,
      preferred,
    };

    await prisma.$transaction(async (tx) => {
      // So um preferido por insumo: marcar um desmarca o anterior, senao a
      // lista de compras nao saberia qual seguir.
      if (preferred) {
        await tx.supplierOffer.updateMany({
          where: { ingredientId, NOT: { supplierId } },
          data: { preferred: false },
        });
      }

      await tx.supplierOffer.upsert({
        where: { ingredientId_supplierId: { ingredientId, supplierId } },
        create: { ingredientId, supplierId, ...dados },
        update: dados,
      });
    });

    revalidar();
    return { ok: true, message: 'Preco do fornecedor guardado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteOffer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Preco nao informado.');
    await prisma.supplierOffer.delete({ where: { id } });
    revalidar();
    return { ok: true, message: 'Preco removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Passa o preco de um fornecedor a ser o preco do insumo.
 *
 * E um gesto explicito de proposito. O preco do insumo alimenta o custo de
 * todas as fichas que o usam: se adotar sozinho o mais barato, o custo dos
 * produtos mudava por baixo dos pes de quem anotou um preco so para comparar.
 */
export async function adoptOffer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    if (!id) throw new Error('Preco nao informado.');

    const oferta = await prisma.supplierOffer.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        ingredient: { select: { id: true, name: true } },
      },
    });
    if (!oferta) throw new Error('Preco nao encontrado.');

    await prisma.ingredient.update({
      where: { id: oferta.ingredientId },
      data: {
        supplierId: oferta.supplierId,
        purchasePrice: num(oferta.purchasePrice),
        purchaseQty: num(oferta.purchaseQty),
        purchaseUnit: oferta.purchaseUnit,
        baseUnit: baseUnitOf(oferta.purchaseUnit),
      },
    });

    revalidar();
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    revalidatePath('/');

    return {
      ok: true,
      message: `"${oferta.ingredient.name}" passou a custar o preco de ${oferta.supplier.name}. O custo das fichas que o usam foi recalculado.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
