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
import { num } from '@/lib/mappers';
import { parseDecimal } from '@/lib/money';
import { baseUnitOf, toBase, type PurchaseUnit } from '@/lib/units';
import { lerPreco } from './offers';
import { findSimilarNames } from '@/lib/pricing/offers';
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
 * A perda chega como fator de correcao. O formulario mostra tambem a
 * percentagem, mas os dois campos estao sincronizados no cliente e e o FC que
 * e enviado — ver `components/forms/waste-input.tsx`.
 */
function readCorrectionFactor(form: FormData): number {
  const fc = parseDecimal(String(form.get('correctionFactor') ?? '1'));
  if (fc > 0) return fc;
  // Campo vazio ou invalido significa "sem perda", nao "zero".
  return 1;
}

function readIngredient(form: FormData) {
  return ingredientSchema.parse({
    name: String(form.get('name') ?? ''),
    category: String(form.get('category') ?? 'FOOD'),
    supplierId: String(form.get('supplierId') ?? ''),
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

    // Preco, quantidade e fornecedor nao estao aqui: vivem na lista de
    // precos e chegam ao insumo por copia do que estiver em uso.
    const payload = {
      name: data.name,
      category: data.category,
      baseUnit: baseUnitOf(data.purchaseUnit as PurchaseUnit),
      correctionFactor: data.correctionFactor,
      stockBase: data.stockBase,
      sku: data.sku || null,
      notes: data.notes || null,
    };

    if (id) {
      // Mexer no estoque a mao tambem e um movimento. Sem isto, o saldo
      // mudava sem deixar rasto no livro — e o livro existe precisamente
      // para se poder perguntar "porque e que diz isto?".
      const antes = await prisma.ingredient.findUnique({
        where: { id },
        select: { stockBase: true, avgCostBase: true },
      });

      await prisma.ingredient.update({ where: { id }, data: payload });

      const diferenca = data.stockBase - num(antes?.stockBase ?? 0);
      if (Math.abs(diferenca) > 1e-9) {
        await prisma.stockMovement.create({
          data: {
            ingredientId: id,
            kind: 'ADJUSTMENT',
            qtyBase: diferenca,
            unitCost: num(antes?.avgCostBase ?? 0),
            value: diferenca * num(antes?.avgCostBase ?? 0),
            note: 'Ajuste ao editar o insumo',
          },
        });
      }
    } else {
      // Ao criar, avisar se ja existe algo com nome parecido. Nao bloqueia:
      // "Tomate" e "Tomate cereja" sao produtos legitimos e diferentes. So
      // pergunta, e a segunda tentativa traz a confirmacao.
      if (form.get('confirmDuplicate') !== '1') {
        const existentes = await prisma.ingredient.findMany({
          select: { name: true },
        });
        const parecidos = findSimilarNames(
          data.name,
          existentes.map((i) => i.name),
        );

        if (parecidos.length > 0) {
          return {
            ok: false,
            message:
              parecidos.length === 1
                ? 'Ja existe um insumo com nome muito parecido. Confirme que sao mesmo coisas diferentes.'
                : 'Ja existem insumos com nomes muito parecidos. Confirme que sao mesmo coisas diferentes.',
            similar: parecidos,
          };
        }
      }

      // O insumo nasce com o seu primeiro preco, senao ficava com custo zero
      // e as fichas que o usassem mentiam em silencio.
      const preco = await lerPreco(form);

      if (baseUnitOf(preco.purchaseUnit) !== payload.baseUnit) {
        throw new Error(
          'A unidade do preco tem de ser da mesma familia da unidade de medida do insumo.',
        );
      }

      await prisma.$transaction(async (tx) => {
        const criado = await tx.ingredient.create({
          data: {
            ...payload,
            supplierId: preco.supplierId,
            purchasePrice: preco.purchasePrice,
            purchaseQty: preco.purchaseQty,
            purchaseUnit: preco.purchaseUnit,
            // Estoque inicial com base de custo: sem ela, as saidas desse
            // saldo entravam a zero no CMV real.
            avgCostBase:
              payload.stockBase > 0
                ? preco.purchasePrice / toBase(preco.purchaseQty, preco.purchaseUnit)
                : 0,
          },
        });

        await tx.supplierOffer.create({
          data: {
            ingredientId: criado.id,
            supplierId: preco.supplierId,
            purchasePrice: preco.purchasePrice,
            purchaseQty: preco.purchaseQty,
            purchaseUnit: preco.purchaseUnit,
            sku: preco.sku,
            inUse: true,
          },
        });
      });
    }

    revalidatePath('/insumos');
    // 'layout' apanha tambem as paginas de ficha individuais, onde o insumo
    // novo tem de aparecer no seletor sem obrigar a recarregar.
    revalidatePath('/fichas', 'layout');
    revalidatePath('/precificacao', 'layout');
    revalidatePath('/estoque');
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
      address: String(form.get('address') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
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

