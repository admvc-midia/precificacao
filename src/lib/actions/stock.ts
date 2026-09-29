'use server';

/**
 * Movimentos de estoque.
 *
 * ---------------------------------------------------------------------------
 * LER FORA, ESCREVER DENTRO
 * ---------------------------------------------------------------------------
 * Todas as leituras acontecem antes da transacao, o plano e calculado em
 * memoria por `planMovements`, e a transacao fica so com escritas.
 *
 * Nao e preciosismo: a primeira versao lia o estado de cada insumo de dentro
 * da transacao, um por um. Contra o Supabase, com uma dezena de insumos, isso
 * estourava o limite de tempo das transacoes interativas do Prisma
 * ("Transaction not found... refers to an old closed transaction") e nada era
 * gravado — com a action a devolver sucesso na mesma.
 *
 * A protecao contra gravar duas vezes passou a ser um `updateMany` com
 * condicao, que e atomico: quem chegar segundo ve `count === 0` e desiste.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { buildCostContext, num } from '@/lib/mappers';
import { parseDecimal } from '@/lib/money';
import { explodeIngredients } from '@/lib/pricing/cost';
import { buildPurchaseList } from '@/lib/pricing/purchase';
import {
  inventoryAdjustment,
  planMovements,
  type PlanEntry,
  type PlannedMovement,
  type StockState,
} from '@/lib/pricing/stock';
import { toBase, type PurchaseUnit } from '@/lib/units';
import { errorMessage, PURCHASE_UNIT, type ActionState } from './shared';

/** Saldo e custo medio de todos os insumos, para alimentar o plano. */
async function lerEstados(): Promise<Map<string, StockState>> {
  const rows = await prisma.ingredient.findMany({
    select: { id: true, stockBase: true, avgCostBase: true },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { qtyBase: num(r.stockBase), avgUnitCost: num(r.avgCostBase) },
    ]),
  );
}

/** Escreve o plano: os movimentos de uma vez, depois um saldo por insumo. */
async function gravarPlano(
  plano: PlannedMovement[],
  orderId: string | null,
  guarda?: () => Promise<boolean>,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      if (guarda && !(await guarda())) {
        throw new Error('Esta operacao ja tinha sido registada.');
      }

      await tx.stockMovement.createMany({
        data: plano.map((m) => ({
          ingredientId: m.ingredientId,
          kind: m.kind,
          qtyBase: m.qtyBase,
          unitCost: m.unitCost,
          value: m.value,
          orderId,
          note: m.note ?? null,
        })),
      });

      // Um update por insumo: o Postgres nao tem update em massa com valores
      // diferentes por linha, e sao poucas linhas.
      const finais = new Map<string, PlannedMovement>();
      for (const m of plano) finais.set(m.ingredientId, m);

      for (const m of finais.values()) {
        await tx.ingredient.update({
          where: { id: m.ingredientId },
          data: { stockBase: m.finalQtyBase, avgCostBase: m.finalAvgCost },
        });
      }
    },
    // Folga generosa: a ligacao ao Supabase e remota e cada escrita custa
    // uma ida e volta.
    { timeout: 20000, maxWait: 10000 },
  );
}

// ---------------------------------------------------------------------------
// Entradas: receber uma compra
// ---------------------------------------------------------------------------

/**
 * Da entrada no estoque das embalagens que a lista de compras mandou comprar.
 *
 * Entra o que se **comprou** (embalagens inteiras), nao o que faltava — e por
 * isso que sobra despensa, e essa sobra tem de aparecer no armazem.
 */
export async function receivePurchase(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const orderId = String(form.get('orderId') ?? '');
    if (!orderId) throw new Error('Ordem nao informada.');

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) throw new Error('Ordem nao encontrada.');
    if (order.receivedAt) {
      throw new Error(
        'Esta compra ja deu entrada no estoque. Para corrigir, use um ajuste manual.',
      );
    }
    if (order.lines.length === 0) {
      throw new Error('A ordem nao tem produtos, logo nao ha nada a comprar.');
    }

    const [ingredients, recipes, estados] = await Promise.all([
      prisma.ingredient.findMany(),
      prisma.recipe.findMany({ include: { items: true } }),
      lerEstados(),
    ]);

    const lista = buildPurchaseList(
      order.lines.map((l) => ({ recipeId: l.recipeId, qty: num(l.qty) })),
      buildCostContext(ingredients, recipes),
    );

    const entradas: PlanEntry[] = lista.lines
      .filter((l) => l.packsToBuy > 0)
      .map((l) => ({
        ingredientId: l.ingredient.id,
        kind: 'PURCHASE' as const,
        qtyBase: l.purchasedBase,
        unitCost: l.packSizeBase > 0 ? l.ingredient.purchasePrice / l.packSizeBase : 0,
        note: `${l.packsToBuy}x embalagem`,
      }));

    if (entradas.length === 0) {
      throw new Error('O estoque ja cobre esta ordem: nao ha nada a receber.');
    }

    const plano = planMovements(estados, entradas);

    await gravarPlano(plano, orderId, async () => {
      // Guarda atomica: so passa quem encontrar a ordem ainda por receber.
      const r = await prisma.productionOrder.updateMany({
        where: { id: orderId, receivedAt: null },
        data: { receivedAt: new Date() },
      });
      return r.count === 1;
    });

    revalidarTudo(orderId);
    return {
      ok: true,
      message: `${plano.length} insumo(s) deram entrada no estoque.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Saidas: executar a producao
// ---------------------------------------------------------------------------

/**
 * Tira do estoque o que a producao consumiu, pela explosao das fichas.
 *
 * Sai a quantidade **com fator de correcao** — o que saiu do armazem inclui a
 * parte que foi para o lixo na limpeza.
 */
export async function recordProduction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const orderId = String(form.get('orderId') ?? '');
    if (!orderId) throw new Error('Ordem nao informada.');

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) throw new Error('Ordem nao encontrada.');
    if (order.producedAt) throw new Error('Esta producao ja foi registada.');
    if (order.lines.length === 0) throw new Error('A ordem nao tem produtos.');

    const [ingredients, recipes, estados] = await Promise.all([
      prisma.ingredient.findMany(),
      prisma.recipe.findMany({ include: { items: true } }),
      lerEstados(),
    ]);

    const consumo = explodeIngredients(
      order.lines.map((l) => ({ recipeId: l.recipeId, qty: num(l.qty) })),
      buildCostContext(ingredients, recipes),
    );

    // Uma producao para oferecer sai do estoque na mesma, mas com outro
    // carimbo: o CMV real ignora-a e ela aparece como custo de divulgacao.
    const tipo = order.promotional ? ('PROMO' as const) : ('PRODUCTION' as const);

    const entradas: PlanEntry[] = [...consumo.entries()].map(([id, qty]) => ({
      ingredientId: id,
      kind: tipo,
      qtyBase: -qty,
    }));

    const plano = planMovements(estados, entradas);

    await gravarPlano(plano, orderId, async () => {
      const r = await prisma.productionOrder.updateMany({
        where: { id: orderId, producedAt: null },
        data: { producedAt: new Date() },
      });
      return r.count === 1;
    });

    revalidarTudo(orderId);
    return {
      ok: true,
      message: order.promotional
        ? `Amostras registadas: ${plano.length} insumo(s) sairam do estoque, como custo de divulgacao.`
        : `Producao registada: ${plano.length} insumo(s) sairam do estoque.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Ajustes manuais e quebras
// ---------------------------------------------------------------------------

export async function recordAdjustment(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    if (!ingredientId) throw new Error('Insumo nao informado.');

    const tipo = String(form.get('kind') ?? 'ADJUSTMENT');
    if (tipo !== 'ADJUSTMENT' && tipo !== 'WASTE') {
      throw new Error('Tipo de movimento invalido.');
    }

    const qty = parseDecimal(String(form.get('qty') ?? ''));
    if (qty <= 0) throw new Error('A quantidade tem de ser maior que zero.');

    const unit = PURCHASE_UNIT.parse(String(form.get('unit') ?? 'G'));
    const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new Error('Insumo nao encontrado.');

    const qtyBase = toBase(qty, unit as PurchaseUnit, ing.baseUnit);

    // Uma quebra so pode tirar. Um ajuste pode ir nos dois sentidos.
    const sentido =
      tipo === 'WASTE' ? -1 : String(form.get('direction') ?? 'OUT') === 'IN' ? 1 : -1;

    const estados = new Map<string, StockState>([
      [
        ing.id,
        { qtyBase: num(ing.stockBase), avgUnitCost: num(ing.avgCostBase) },
      ],
    ]);

    const plano = planMovements(estados, [
      {
        ingredientId,
        kind: tipo,
        qtyBase: qtyBase * sentido,
        note: String(form.get('note') ?? '').trim() || undefined,
      },
    ]);

    await gravarPlano(plano, null);

    revalidarTudo();
    return {
      ok: true,
      message: tipo === 'WASTE' ? 'Quebra registada.' : 'Ajuste registado.',
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Contagem de inventario: o utilizador diz o que contou, a aplicacao escreve
 * a diferenca. Guardar o saldo contado sem registar o movimento esconderia
 * exatamente a informacao que interessa — quanto e que faltava.
 */
export async function countInventory(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    if (!ingredientId) throw new Error('Insumo nao informado.');

    const contado = parseDecimal(String(form.get('counted') ?? ''));
    if (contado < 0) throw new Error('A contagem nao pode ser negativa.');

    const unit = PURCHASE_UNIT.parse(String(form.get('unit') ?? 'G'));

    const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new Error('Insumo nao encontrado.');

    const contadoBase = toBase(contado, unit as PurchaseUnit, ing.baseUnit);
    const estado: StockState = {
      qtyBase: num(ing.stockBase),
      avgUnitCost: num(ing.avgCostBase),
    };

    const ajuste = inventoryAdjustment(estado, contadoBase);
    if (!ajuste) {
      return { ok: true, message: 'A contagem confirma o saldo: nada a ajustar.' };
    }

    const plano = planMovements(new Map([[ing.id, estado]]), [
      {
        ingredientId,
        kind: 'INVENTORY',
        qtyBase: ajuste.qtyBase,
        unitCost: ajuste.unitCost,
        note: String(form.get('note') ?? '').trim() || undefined,
      },
    ]);

    await gravarPlano(plano, null);

    const unidade = ing.baseUnit === 'UN' ? 'un' : ing.baseUnit.toLowerCase();
    const sinal = ajuste.qtyBase > 0 ? 'a mais' : 'em falta';

    revalidarTudo();
    return {
      ok: true,
      message: `Contagem registada: ${Math.abs(ajuste.qtyBase).toFixed(2)} ${unidade} ${sinal}.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Atribui uma base de custo a um saldo que nao a tem.
 *
 * Estoque digitado a mao ou vindo de um arranque nao passou por nenhuma
 * compra, logo nao tem custo associado — e as saidas dele entram no CMV real
 * a zero, fazendo o custo parecer menor do que foi. Isto marca esse saldo ao
 * preco de compra atual do insumo.
 *
 * Nao e um movimento: a quantidade nao muda, so a valorizacao. Por isso nao
 * entra no livro, que regista mexidas de quantidade.
 */
export async function setCostBasis(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ingredientId = String(form.get('ingredientId') ?? '');
    if (!ingredientId) throw new Error('Insumo nao informado.');

    const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new Error('Insumo nao encontrado.');

    const qtyBase = toBase(num(ing.purchaseQty), ing.purchaseUnit);
    if (qtyBase <= 0) {
      throw new Error('A quantidade de compra do insumo tem de ser maior que zero.');
    }

    // Preco de compra por unidade base. Sem fator de correcao: o que esta no
    // armazem e o que se comprou, ainda com as aparas.
    const custo = num(ing.purchasePrice) / qtyBase;

    await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { avgCostBase: custo },
    });

    revalidarTudo();
    return {
      ok: true,
      message: `Saldo de "${ing.name}" valorizado ao preco de compra atual.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

function revalidarTudo(orderId?: string) {
  revalidatePath('/estoque');
  revalidatePath('/insumos');
  revalidatePath('/producao');
  revalidatePath('/vendas');
  revalidatePath('/');
  if (orderId) revalidatePath(`/producao/${orderId}`);
}
