'use server';

/**
 * Precos de um insumo em cada fornecedor.
 *
 * Um insumo tem uma lista de precos e **exatamente um em uso**. O que esta em
 * uso alimenta o custo de todas as fichas tecnicas e e o que a lista de
 * compras recomenda.
 *
 * Ser escolha explicita e o ponto do desenho: anotar o preco de outro
 * fornecedor so para comparar nao pode mudar o custo dos produtos sem
 * ninguem mandar.
 *
 * O `Ingredient` continua a guardar preco, quantidade e unidade porque e dai
 * que todo o motor de custos le. Esses campos sao sempre uma copia do preco
 * em uso, mantida por `sincronizarEmUso`.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { parseDecimal, parseQty } from '@/lib/money';
import { rankOffers } from '@/lib/pricing/offers';
import { baseUnitOf, type PurchaseUnit } from '@/lib/units';
import { sincronizarEmUso } from '@/lib/escritas';
import { errorMessage, PURCHASE_UNIT, type ActionState } from './shared';

function revalidar() {
  revalidatePath('/insumos');
  revalidatePath('/producao');
  revalidatePath('/fornecedores');
  revalidatePath('/estoque');
  // 'layout' apanha tambem as paginas individuais de ficha e de preco.
  revalidatePath('/fichas', 'layout');
  revalidatePath('/precificacao', 'layout');
  revalidatePath('/');
}

export interface DadosDePreco {
  supplierId: string | null;
  purchasePrice: number;
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  sku: string | null;
  notes: string | null;
}

/** Le e valida os campos de preco de um formulario. */
export async function lerPreco(form: FormData): Promise<DadosDePreco> {
  const purchasePrice = parseDecimal(String(form.get('purchasePrice') ?? ''));
  const purchaseQty = parseQty(String(form.get('purchaseQty') ?? ''));
  const purchaseUnit = PURCHASE_UNIT.parse(
    String(form.get('purchaseUnit') ?? 'KG'),
  ) as PurchaseUnit;

  if (purchasePrice <= 0) throw new Error('O preco tem de ser maior que zero.');
  if (purchaseQty <= 0) {
    throw new Error('O tamanho da embalagem tem de ser maior que zero.');
  }

  return {
    supplierId: String(form.get('supplierId') ?? '') || null,
    purchasePrice,
    purchaseQty,
    purchaseUnit,
    sku: String(form.get('sku') ?? '').trim() || null,
    notes: String(form.get('notes') ?? '').trim() || null,
  };
}

/**
 * Guarda um preco: novo, ou alteracao de um que ja existe.
 *
 * Com `id` no formulario altera aquela linha — e assim que se corrige um
 * tamanho de embalagem mal escrito. Sem `id`, acrescenta; se ja houver preco
 * desse fornecedor para este insumo, atualiza-o em vez de duplicar.
 */
export async function saveOffer(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    if (!ingredientId) throw new Error('Insumo nao informado.');

    const id = String(form.get('id') ?? '');
    const dados = await lerPreco(form);

    const insumo = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { baseUnit: true, name: true },
    });
    if (!insumo) throw new Error('Insumo nao encontrado.');

    // Comparar precos exige a mesma familia de unidades: nao ha como pesar um
    // preco por litro contra um preco por quilo.
    if (baseUnitOf(dados.purchaseUnit) !== insumo.baseUnit) {
      const medida =
        insumo.baseUnit === 'UN' ? 'unidades' : insumo.baseUnit.toLowerCase();
      throw new Error(
        `"${insumo.name}" mede-se em ${medida}. Escolha uma unidade dessa familia para os precos poderem ser comparados.`,
      );
    }

    const mensagem = await prisma.$transaction(async (tx) => {
      // A linha a alterar: a indicada por `id`, ou a que ja existe para este
      // fornecedor.
      let alvo = null;
      if (id) {
        alvo = await tx.supplierOffer.findUnique({ where: { id } });
        if (!alvo || alvo.ingredientId !== ingredientId) {
          throw new Error('Preco nao encontrado neste insumo.');
        }
      } else if (dados.supplierId) {
        alvo = await tx.supplierOffer.findUnique({
          where: {
            ingredientId_supplierId: { ingredientId, supplierId: dados.supplierId },
          },
        });
      }

      // Um so preco por fornecedor, e um so sem fornecedor. O Postgres trata
      // NULLs como distintos, por isso a restricao unica nao apanha o segundo
      // caso — e nenhuma das duas apanha a troca de fornecedor numa edicao.
      const colisao = await tx.supplierOffer.findFirst({
        where: {
          ingredientId,
          supplierId: dados.supplierId,
          ...(alvo ? { NOT: { id: alvo.id } } : {}),
        },
        include: { supplier: { select: { name: true } } },
      });
      if (colisao) {
        throw new Error(
          colisao.supplierId
            ? `Ja existe um preco de ${colisao.supplier?.name} para este insumo. Altere esse em vez de criar outro.`
            : 'Ja existe um preco sem fornecedor para este insumo. Altere esse, ou escolha um fornecedor.',
        );
      }

      const oferta = alvo
        ? await tx.supplierOffer.update({ where: { id: alvo.id }, data: dados })
        : await tx.supplierOffer.create({ data: { ingredientId, ...dados } });

      const emUso = await tx.supplierOffer.findFirst({
        where: { ingredientId, inUse: true },
      });

      // Tres razoes para copiar o preco para o insumo:
      //  - ainda nao havia nenhum em uso (o primeiro entra sozinho, senao o
      //    insumo ficava com uma lista de precos e nenhum a valer);
      //  - foi pedido explicitamente;
      //  - **alterou-se justamente o que estava em uso**. Sem isto, corrigir
      //    a embalagem do preco em uso mudava a lista e deixava o custo das
      //    fichas na cache antiga, sem nada a dizer.
      const mexeuNoEmUso = emUso?.id === oferta.id;

      if (!emUso || mexeuNoEmUso || form.get('setInUse') === '1') {
        await sincronizarEmUso(tx, ingredientId, oferta.id);
        if (mexeuNoEmUso) {
          return 'Preco alterado. O custo das fichas que usam este insumo foi recalculado.';
        }
        return alvo
          ? 'Preco alterado e passou a ser o preco em uso.'
          : 'Preco guardado e passou a ser o preco em uso.';
      }

      return alvo ? 'Preco alterado.' : 'Preco guardado.';
    });

    revalidar();
    return { ok: true, message: mensagem };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Passa um preco da lista a ser o que alimenta o custo das fichas. */
export async function setOfferInUse(
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
        ingredient: { select: { name: true } },
      },
    });
    if (!oferta) throw new Error('Preco nao encontrado.');

    await prisma.$transaction((tx) => sincronizarEmUso(tx, oferta.ingredientId, id));

    revalidar();
    return {
      ok: true,
      message: `"${oferta.ingredient.name}" passou a usar o preco de ${
        oferta.supplier?.name ?? 'sem fornecedor'
      }. O custo das fichas que o usam foi recalculado.`,
    };
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

    const mensagem = await prisma.$transaction(async (tx) => {
      const oferta = await tx.supplierOffer.findUnique({ where: { id } });
      if (!oferta) throw new Error('Preco nao encontrado.');

      const restantes = await tx.supplierOffer.findMany({
        where: { ingredientId: oferta.ingredientId, NOT: { id } },
        include: { supplier: { select: { name: true } } },
      });

      // O ultimo preco nao se apaga: o insumo ficaria sem custo e todas as
      // fichas que o usam passavam a mentir.
      if (restantes.length === 0) {
        throw new Error(
          'Este e o unico preco do insumo. Edite-o em vez de o remover — sem preco, as fichas que o usam ficavam sem custo.',
        );
      }

      await tx.supplierOffer.delete({ where: { id } });

      if (!oferta.inUse) return 'Preco removido.';

      // Apagou-se o que estava em uso: assume o mais barato dos que sobram,
      // para nunca ficar nenhum a valer.
      const [melhor] = rankOffers(
        restantes.map((o) => ({
          id: o.id,
          supplierId: o.supplierId,
          supplierName: o.supplier?.name ?? 'Sem fornecedor',
          purchasePrice: num(o.purchasePrice),
          purchaseQty: num(o.purchaseQty),
          purchaseUnit: o.purchaseUnit,
          inUse: o.inUse,
        })),
      );

      await sincronizarEmUso(tx, oferta.ingredientId, melhor.id);
      return `Preco removido. O insumo passou a usar o de ${melhor.supplierName}, que era o mais barato dos restantes.`;
    });

    revalidar();
    return { ok: true, message: mensagem };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
