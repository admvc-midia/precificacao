'use server';

/**
 * Encomendas de clientes: criar, mudar de estado, receber o pagamento e
 * mandar para producao.
 *
 * O preco de cada linha nasce do preco de tabela da ficha (o do balcao, pelo
 * modo que a ficha escolheu) e pode ser mudado — desconto, preco de amigo.
 * Os custos ficam congelados quando a linha entra.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { parseDecimal, parseQty } from '@/lib/money';
import {
  normalizePhone,
  parseLocalDateTime,
  readOrderLines,
  sumByRecipe,
  type OrderStatus,
} from '@/lib/pricing/encomendas';
import { followUpDate } from '@/lib/pricing/clientes';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes } from '@/lib/queries';
import { alvoDoFormulario, registar, resumoDoFormulario } from '@/lib/registo';
import { exigirDono, exigirPerfil } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const STATUS = ['REQUESTED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED'] as const;
const PAGAMENTOS = ['CASH', 'MBWAY', 'CARD', 'TRANSFER'] as const;
const ENTREGAS = ['PICKUP', 'DELIVERY'] as const;
const ORIGENS = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'EVENT', 'OTHER'] as const;

function revalidar(id?: string) {
  revalidatePath('/encomendas');
  if (id) revalidatePath(`/encomendas/${id}`);
  revalidatePath('/vendas');
  revalidatePath('/');
}

/** Texto do formulario, ou `undefined` se o campo nao veio (≠ vazio). */
function campo(form: FormData, nome: string): string | undefined {
  return form.has(nome) ? String(form.get(nome) ?? '').trim() : undefined;
}

/**
 * Preco de tabela e custos de hoje, por ficha. Uma leitura so para todas as
 * linhas: o custo de um produto pode descer por varias sub-receitas.
 */
async function tabelaDeHoje() {
  const { recipes, settings, channels } = await getCostedRecipes();
  const ref = referenceChannel(channels);
  return new Map(
    recipes.map((r) => {
      const preco = priceForRecipe(r, ref, settings);
      return [
        r.id,
        {
          name: r.name,
          kind: r.kind,
          error: r.error,
          listPrice: preco?.feasible && preco.price > 0 ? preco.price : null,
          food: r.cost?.foodCostPerUnit ?? 0,
          packaging: r.cost?.packagingCost ?? 0,
          deliveryPackaging: r.cost?.deliveryPackagingCost ?? 0,
        },
      ];
    }),
  );
}

type Tabela = Awaited<ReturnType<typeof tabelaDeHoje>>;

/** Os dados de uma linha nova, com o preco combinado ou o de tabela. */
function linhaNova(tabela: Tabela, recipeId: string, qty: number, price: number | null) {
  const t = tabela.get(recipeId);
  if (!t || t.kind !== 'PRODUCT') throw new Error('Produto nao encontrado.');
  if (t.error) throw new Error(`"${t.name}": ${t.error}`);
  if (!(qty > 0)) throw new Error(`A quantidade de "${t.name}" tem de ser maior que zero.`);

  const unitPrice = price ?? t.listPrice;
  if (unitPrice === null) {
    throw new Error(`"${t.name}" nao tem preco de tabela. Escreva o preco combinado.`);
  }
  if (unitPrice < 0) throw new Error(`O preco de "${t.name}" nao pode ser negativo.`);

  return {
    recipeId,
    qty,
    unitPrice,
    listPrice: t.listPrice,
    unitFoodCost: t.food,
    unitPackagingCost: t.packaging,
    unitDeliveryPackagingCost: t.deliveryPackaging,
  };
}

/**
 * O cliente da encomenda: o escolhido da lista, o mesmo telefone, ou um novo.
 *
 * Reconhecer pelo telefone evita duas fichas da mesma pessoa — "Ana" hoje e
 * "Ana Silva" para a semana. Pelo nome sozinho nao: ha muitas Anas.
 */
async function resolverCliente(form: FormData): Promise<string | null> {
  const id = campo(form, 'customerId') ?? '';
  const name = campo(form, 'customerName') ?? '';
  const phone = campo(form, 'customerPhone') ?? '';
  const consent = form.get('contactConsent') === 'on';

  if (id) {
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw new Error('Cliente nao encontrado.');
    await prisma.customer.update({
      where: { id },
      data: {
        // So completa: nao apaga um telefone que ja la estava.
        phone: c.phone || phone || null,
        contactConsentAt: consent && !c.contactConsentAt ? new Date() : undefined,
      },
    });
    return id;
  }

  if (!name) {
    if (phone) throw new Error('Escreva o nome do cliente.');
    return null;
  }

  if (phone) {
    const alvo = normalizePhone(phone);
    const comTelefone = await prisma.customer.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true, contactConsentAt: true },
    });
    const mesmo = comTelefone.find((c) => normalizePhone(c.phone!) === alvo);
    if (mesmo) {
      if (consent && !mesmo.contactConsentAt) {
        await prisma.customer.update({
          where: { id: mesmo.id },
          data: { contactConsentAt: new Date() },
        });
      }
      return mesmo.id;
    }
  }

  // So para clientes novos: de onde veio e quem indicou. Num cliente que ja
  // existe isto muda-se na ficha dele.
  const source = campo(form, 'customerSource') || null;
  if (source && !ORIGENS.includes(source as (typeof ORIGENS)[number])) {
    throw new Error('Origem invalida.');
  }
  const referredById = (source === 'REFERRAL' && campo(form, 'referredById')) || null;

  const novo = await prisma.customer.create({
    data: {
      name,
      phone: phone || null,
      contactConsentAt: consent ? new Date() : null,
      source: source as (typeof ORIGENS)[number] | null,
      referredById,
    },
  });
  return novo.id;
}

// ---------------------------------------------------------------------------
// Criar e alterar
// ---------------------------------------------------------------------------

export async function createCustomerOrder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    await exigirDono();
    const dueAt = parseLocalDateTime(campo(form, 'dueAt') ?? '');
    if (!dueAt) throw new Error('Escolha o dia e a hora da entrega.');

    const fulfillment = campo(form, 'fulfillment') === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const address = campo(form, 'address') || null;
    if (fulfillment === 'DELIVERY' && !address) {
      throw new Error('Para entregar, escreva a morada.');
    }

    const linhas = readOrderLines(form, parseQty, parseDecimal);
    if (linhas.length === 0) throw new Error('Junte pelo menos um produto.');

    const tabela = await tabelaDeHoje();
    const dados = linhas.map((l) => linhaNova(tabela, l.recipeId, l.qty, l.price));

    const channelId = campo(form, 'channelId') || null;
    const customerId = await resolverCliente(form);

    const order = await prisma.customerOrder.create({
      data: {
        customerId,
        channelId,
        dueAt,
        fulfillment,
        address,
        notes: campo(form, 'notes') || null,
        lines: { create: dados },
      },
    });
    id = order.id;
    revalidar(id);
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/encomendas/${id}`);
}

/**
 * Dia, entrega, morada, canal e notas. So muda o que vier no formulario: um
 * campo ausente nao e um campo vazio (foi assim que as configuracoes ficaram
 * a zero uma vez).
 */
export async function updateCustomerOrder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Encomenda nao informada.');

    const data: {
      dueAt?: Date;
      fulfillment?: 'PICKUP' | 'DELIVERY';
      address?: string | null;
      notes?: string | null;
      channelId?: string | null;
    } = {};

    const due = campo(form, 'dueAt');
    if (due !== undefined) {
      const d = parseLocalDateTime(due);
      if (!d) throw new Error('Data de entrega invalida.');
      data.dueAt = d;
    }
    const f = campo(form, 'fulfillment');
    if (f !== undefined) {
      if (!ENTREGAS.includes(f as (typeof ENTREGAS)[number])) throw new Error('Entrega invalida.');
      data.fulfillment = f as 'PICKUP' | 'DELIVERY';
    }
    const address = campo(form, 'address');
    if (address !== undefined) data.address = address || null;
    const notes = campo(form, 'notes');
    if (notes !== undefined) data.notes = notes || null;
    const channelId = campo(form, 'channelId');
    if (channelId !== undefined) data.channelId = channelId || null;

    if (data.fulfillment === 'DELIVERY') {
      const atual = await prisma.customerOrder.findUnique({ where: { id }, select: { address: true } });
      const morada = data.address !== undefined ? data.address : atual?.address;
      if (!morada) throw new Error('Para entregar, escreva a morada.');
    }

    await prisma.customerOrder.update({ where: { id }, data });
    revalidar(id);
    return { ok: true, message: 'Encomenda atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Muda o estado. Entregue marca o dia da venda; sair de entregue desmarca-o,
 * para a venda nao ficar a contar no mes.
 *
 * Entregar agenda tambem o pos-venda, `followUpDays` depois — so a quem
 * aceitou ser contactado, e so se ainda nao respondeu. Sair de entregue
 * desfaz o agendamento.
 */
export async function setCustomerOrderStatus(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    // A cozinha muda o estado (em producao, pronta, entregue); cancelar ou
    // reabrir uma cancelada e decisao do dono.
    const eu = await exigirPerfil('OWNER', 'KITCHEN');
    const id = campo(form, 'id');
    const status = campo(form, 'status') as OrderStatus | undefined;
    if (!id) throw new Error('Encomenda nao informada.');
    if (!status || !STATUS.includes(status)) throw new Error('Estado invalido.');
    const cancelada = await prisma.customerOrder.findUnique({ where: { id }, select: { status: true } });
    if (eu.perfil !== 'OWNER' && (status === 'CANCELLED' || cancelada?.status === 'CANCELLED')) {
      throw new Error('Cancelar ou reabrir uma encomenda e com o dono.');
    }

    const [atual, settings] = await Promise.all([
      prisma.customerOrder.findUnique({
        where: { id },
        select: {
          status: true,
          deliveredAt: true,
          feedbackAt: true,
          customer: { select: { contactConsentAt: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.settings.findUnique({ where: { id: 'default' }, select: { followUpDays: true } }),
    ]);
    if (!atual) throw new Error('Encomenda nao encontrada.');
    if (status === 'DELIVERED' && atual._count.lines === 0) {
      throw new Error('Uma encomenda sem produtos nao pode ser entregue.');
    }

    const entregaAgora = status === 'DELIVERED' && atual.status !== 'DELIVERED';
    const deliveredAt =
      status === 'DELIVERED' ? (entregaAgora ? new Date() : atual.deliveredAt) : null;
    const podeContactar = Boolean(atual.customer?.contactConsentAt) && !atual.feedbackAt;

    await prisma.customerOrder.update({
      where: { id },
      data: {
        status,
        deliveredAt,
        followUpDueAt: atual.feedbackAt
          ? undefined
          : entregaAgora && podeContactar
            ? followUpDate(deliveredAt!, settings?.followUpDays ?? 2)
            : status === 'DELIVERED'
              ? undefined
              : null,
      },
    });
    revalidar(id);
    await registar({ quem: eu, acao: 'encomenda.estado', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Estado atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function setCustomerOrderPayment(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Encomenda nao informada.');
    const method = campo(form, 'paymentMethod') ?? '';
    const paid = form.get('paid') === 'on';

    if (method && !PAGAMENTOS.includes(method as (typeof PAGAMENTOS)[number])) {
      throw new Error('Forma de pagamento invalida.');
    }
    if (paid && !method) throw new Error('Escolha como pagou.');

    await prisma.customerOrder.update({
      where: { id },
      data: {
        paid,
        paymentMethod: (method || null) as (typeof PAGAMENTOS)[number] | null,
      },
    });
    revalidar(id);
    await registar({ quem: eu, acao: 'encomenda.pagamento', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: paid ? 'Pagamento registado.' : 'Pagamento atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteCustomerOrder(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Encomenda nao informada.');
    await prisma.customerOrder.delete({ where: { id } });
    revalidar(id);
    await registar({ quem: eu, acao: 'encomenda.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/encomendas');
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

/** Junta um produto. O mesmo produto ao mesmo preco soma a quantidade. */
export async function addCustomerOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await exigirDono();
    const orderId = campo(form, 'orderId');
    const recipeId = campo(form, 'recipeId');
    if (!orderId) throw new Error('Encomenda nao informada.');
    if (!recipeId) throw new Error('Escolha um produto.');

    const priceRaw = campo(form, 'price') ?? '';
    const tabela = await tabelaDeHoje();
    const nova = linhaNova(
      tabela,
      recipeId,
      parseQty(campo(form, 'qty') ?? ''),
      priceRaw ? parseDecimal(priceRaw) : null,
    );

    const igual = await prisma.customerOrderLine.findFirst({
      where: { orderId, recipeId, unitPrice: nova.unitPrice },
    });
    if (igual) {
      await prisma.customerOrderLine.update({
        where: { id: igual.id },
        data: { qty: Number(igual.qty) + nova.qty },
      });
    } else {
      await prisma.customerOrderLine.create({ data: { orderId, ...nova } });
    }

    revalidar(orderId);
    return { ok: true, message: 'Produto juntado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Quantidade e preco de uma linha. Os custos congelados nao mudam. */
export async function updateCustomerOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Linha nao informada.');

    const data: { qty?: number; unitPrice?: number } = {};
    const qtyRaw = campo(form, 'qty');
    if (qtyRaw !== undefined) {
      const qty = parseQty(qtyRaw);
      if (!(qty > 0)) {
        throw new Error('A quantidade tem de ser maior que zero. Para tirar o produto, remova a linha.');
      }
      data.qty = qty;
    }
    const priceRaw = campo(form, 'price');
    if (priceRaw !== undefined) {
      if (!priceRaw) throw new Error('Escreva o preco.');
      const price = parseDecimal(priceRaw);
      if (price < 0) throw new Error('O preco nao pode ser negativo.');
      data.unitPrice = price;
    }

    const linha = await prisma.customerOrderLine.update({ where: { id }, data });
    revalidar(linha.orderId);
    await registar({ quem: eu, acao: 'encomenda.linha', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Linha atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteCustomerOrderLine(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Linha nao informada.');
    const linha = await prisma.customerOrderLine.delete({ where: { id } });
    revalidar(linha.orderId);
    await registar({ quem: eu, acao: 'encomenda.tirar-produto', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: 'Produto removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Producao
// ---------------------------------------------------------------------------

/**
 * Leva encomendas para uma ordem de producao nova, com os produtos somados.
 * Dai em diante e o caminho de sempre: lista de compras, receber, produzir.
 *
 * A ordem fica com o dia da primeira entrega, que e ate quando tem de estar
 * pronta.
 */
export async function produceCustomerOrders(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let orderId: string;
  try {
    await exigirPerfil('OWNER', 'KITCHEN');
    const ids = form.getAll('ids').map(String).filter(Boolean);
    if (ids.length === 0) throw new Error('Marque pelo menos uma encomenda.');

    const encomendas = await prisma.customerOrder.findMany({
      where: { id: { in: ids } },
      include: { lines: true, customer: { select: { name: true } } },
      orderBy: { dueAt: 'asc' },
    });
    if (encomendas.length !== ids.length) throw new Error('Encomenda nao encontrada.');

    const recusadas = encomendas.filter(
      (e) => e.productionOrderId || e.status === 'DELIVERED' || e.status === 'CANCELLED',
    );
    if (recusadas.length > 0) {
      throw new Error(
        `A encomenda ${recusadas.map((e) => e.number).join(', ')} ja foi para producao, entregue ou cancelada.`,
      );
    }

    const linhas = sumByRecipe(
      encomendas.flatMap((e) => e.lines.map((l) => ({ recipeId: l.recipeId, qty: Number(l.qty) }))),
    );
    if (linhas.length === 0) throw new Error('As encomendas marcadas nao tem produtos.');

    const primeira = encomendas[0].dueAt;
    const dia = new Date(
      Date.UTC(primeira.getUTCFullYear(), primeira.getUTCMonth(), primeira.getUTCDate()),
    );
    const diaTxt = `${String(dia.getUTCDate()).padStart(2, '0')}/${String(dia.getUTCMonth() + 1).padStart(2, '0')}`;
    const nomes = encomendas.map((e) => `#${e.number}${e.customer ? ` ${e.customer.name}` : ''}`);

    orderId = await prisma.$transaction(async (tx) => {
      const ordem = await tx.productionOrder.create({
        data: {
          name: `Encomendas ${diaTxt}`,
          dueAt: dia,
          notes: nomes.join(' · '),
          lines: { create: linhas },
        },
      });
      await tx.customerOrder.updateMany({
        where: { id: { in: ids } },
        data: { productionOrderId: ordem.id, status: 'IN_PRODUCTION' },
      });
      return ordem.id;
    });

    revalidar();
    revalidatePath('/producao');
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/producao/${orderId}`);
}
