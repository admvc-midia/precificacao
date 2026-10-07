/**
 * Encomendas: as contas de uma venda feita por pedido.
 *
 * Nada aqui fala com a base. A encomenda chega ja com os custos congelados de
 * cada linha (ver `CustomerOrderLine` no schema), e o motor responde ao que
 * interessa: quanto entrou, quanto foi de IVA e taxas, e quanto sobrou.
 *
 * A conta e a mesma do `breakdown` da precificacao, aplicada ao total da
 * encomenda e nao a uma unidade: as percentagens sao lineares, e o frete do
 * canal paga-se uma vez por encomenda, nao uma vez por bolo.
 */

import { mesEmLisboa } from '@/lib/datas';

import type { GlobalSettings } from './channels';
import { breakdown } from './price';
import type { ChannelInput, PriceBreakdown, PricingParams } from './types';

export type OrderStatus = 'REQUESTED' | 'IN_PRODUCTION' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type PaymentMethod = 'CASH' | 'MBWAY' | 'CARD' | 'TRANSFER';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  REQUESTED: 'Pedida',
  IN_PRODUCTION: 'Em produção',
  READY: 'Pronta',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
};

/** A cor do selo de cada estado. */
export const STATUS_VARIANT: Record<OrderStatus, 'secondary' | 'warning' | 'success' | 'outline'> = {
  REQUESTED: 'secondary',
  IN_PRODUCTION: 'warning',
  READY: 'success',
  DELIVERED: 'outline',
  CANCELLED: 'outline',
};

/** O passo seguinte do caminho normal. Entregue e cancelada nao tem seguinte. */
export const PROXIMO_ESTADO: Partial<Record<OrderStatus, OrderStatus>> = {
  REQUESTED: 'IN_PRODUCTION',
  IN_PRODUCTION: 'READY',
  READY: 'DELIVERED',
};

export const PAGAMENTO_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  MBWAY: 'MB WAY',
  CARD: 'Cartão',
  TRANSFER: 'Transferência',
};

export const ENTREGA_LABEL: Record<Fulfillment, string> = {
  PICKUP: 'Levanta',
  DELIVERY: 'Entregamos',
};

/** Ainda por entregar: o que aparece nas "proximas entregas". */
export function emAberto(status: OrderStatus): boolean {
  return status !== 'DELIVERED' && status !== 'CANCELLED';
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export interface OrderLineInput {
  qty: number;
  unitPrice: number;
  listPrice: number | null;
  unitFoodCost: number;
  unitPackagingCost: number;
  unitDeliveryPackagingCost: number;
}

export interface OrderInput {
  lines: OrderLineInput[];
  fulfillment: Fulfillment;
  /** Nulo: ainda nao se sabe como vai pagar. */
  paymentMethod: PaymentMethod | null;
  channel: ChannelInput | null;
}

export interface OrderResult extends PriceBreakdown {
  /** Soma dos precos de tabela das linhas que tinham um. */
  listTotal: number;
  /** listTotal - price, so das linhas com preco de tabela. Positivo = desconto. */
  discount: number;
  /** A taxa de cartao entrou na conta? */
  cardFeeApplied: boolean;
  /** Embalagem de transporte contada? */
  deliveryPackaging: boolean;
}

/**
 * Os parametros de uma encomenda.
 *
 * A taxa de cartao so se cobra a quem paga com cartao. Enquanto nao se sabe
 * como o cliente vai pagar, conta-se com ela — e o lado prudente: o lucro
 * pode subir quando o pagamento chegar por MB WAY, nunca descer.
 */
export function orderParams(
  settings: GlobalSettings,
  channel: ChannelInput | null,
  paymentMethod: PaymentMethod | null,
): PricingParams {
  const cardRate = channel?.cardFeeRate ?? settings.cardFeeRate;
  return {
    vatRate: settings.vatRate,
    vatMode: settings.vatMode,
    fixedCostRate: settings.fixedCostRate,
    cardFeeRate: paymentMethod === null || paymentMethod === 'CARD' ? cardRate : 0,
    platformFeeRate: channel?.commissionRate ?? 0,
    // Por encomenda, uma vez.
    deliveryCost: channel?.deliveryCost ?? 0,
  };
}

/**
 * Para onde foi o dinheiro de uma encomenda.
 *
 * A embalagem de transporte conta quando a encomenda e entregue por nos ou
 * quando o canal a usa sempre (plataformas).
 */
export function orderResult(order: OrderInput, settings: GlobalSettings): OrderResult {
  const deliveryPackaging =
    order.fulfillment === 'DELIVERY' || Boolean(order.channel?.usesDeliveryPackaging);

  let price = 0;
  let foodCost = 0;
  let packagingCost = 0;
  let listTotal = 0;
  let priceWithList = 0;

  for (const l of order.lines) {
    price += l.qty * l.unitPrice;
    foodCost += l.qty * l.unitFoodCost;
    packagingCost +=
      l.qty * (l.unitPackagingCost + (deliveryPackaging ? l.unitDeliveryPackagingCost : 0));
    if (l.listPrice !== null) {
      listTotal += l.qty * l.listPrice;
      priceWithList += l.qty * l.unitPrice;
    }
  }

  const params = orderParams(settings, order.channel, order.paymentMethod);
  return {
    ...breakdown(price, { foodCost, packagingCost }, params),
    listTotal,
    discount: listTotal - priceWithList,
    cardFeeApplied: params.cardFeeRate > 0,
    deliveryPackaging,
  };
}

/** O que o cliente paga, com IVA, a partir de um preco na convencao das configuracoes. */
export function grossOf(price: number, settings: Pick<GlobalSettings, 'vatMode' | 'vatRate'>): number {
  return settings.vatMode === 'INCLUDED' ? price : price * (1 + settings.vatRate);
}

/**
 * Unidades e receita bruta por produto, das encomendas entregues.
 * Alimenta as Vendas e a engenharia de cardapio.
 */
export function salesByRecipe(
  lines: Array<{ recipeId: string; qty: number; unitPrice: number }>,
  settings: Pick<GlobalSettings, 'vatMode' | 'vatRate'>,
): Map<string, { qty: number; gross: number }> {
  const out = new Map<string, { qty: number; gross: number }>();
  for (const l of lines) {
    const acc = out.get(l.recipeId) ?? { qty: 0, gross: 0 };
    acc.qty += l.qty;
    acc.gross += grossOf(l.qty * l.unitPrice, settings);
    out.set(l.recipeId, acc);
  }
  return out;
}

/** Receita bruta por mes ("2026-10"), das linhas de encomendas entregues. */
export function grossByMonth(
  lines: Array<{ deliveredAt: Date; qty: number; unitPrice: number }>,
  settings: Pick<GlobalSettings, 'vatMode' | 'vatRate'>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const mes = mesEmLisboa(l.deliveredAt);
    out.set(mes, (out.get(mes) ?? 0) + grossOf(l.qty * l.unitPrice, settings));
  }
  return out;
}

/**
 * A faturacao de um mes tipico: a media dos ultimos tres meses com entregas.
 *
 * O mes corrente fica de fora quando ha outros — a meio do mes, a receita
 * esta sempre a meio, e dividir as despesas por ela fazia os custos fixos
 * parecerem o dobro. Se for o unico, entra: e melhor do que nada, e a pagina
 * di-lo.
 */
export function typicalMonth(
  porMes: Map<string, number>,
  mesAtual: string,
): { average: number; months: string[] } | null {
  const todos = [...porMes.keys()].sort().reverse();
  const fechados = todos.filter((m) => m < mesAtual);
  const usados = (fechados.length > 0 ? fechados : todos).slice(0, 3);
  if (usados.length === 0) return null;
  const soma = usados.reduce((a, m) => a + (porMes.get(m) ?? 0), 0);
  return { average: soma / usados.length, months: usados };
}

/** Soma por produto, para levar varias encomendas a uma ordem de producao. */
export function sumByRecipe(
  lines: Array<{ recipeId: string; qty: number }>,
): Array<{ recipeId: string; qty: number }> {
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.recipeId, (out.get(l.recipeId) ?? 0) + l.qty);
  return [...out].map(([recipeId, qty]) => ({ recipeId, qty }));
}

// ---------------------------------------------------------------------------
// Datas: hora de Portugal guardada como UTC
// ---------------------------------------------------------------------------

/**
 * "2026-10-08T15:30" (o que o <input type="datetime-local"> manda) para um
 * Date com essa hora em UTC. `null` se nao for uma data valida.
 *
 * Porque nao converter para a hora real: o servidor da Vercel corre em UTC e
 * o telemovel em hora de Lisboa. Guardar o relogio de parede e mostra-lo
 * sempre com timeZone UTC faz "15:30" ser 15:30 em todo o lado, sem contas
 * de fuso nem de hora de verao.
 */
export function parseLocalDateTime(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const [, a, me, d, h = '00', mi = '00'] = m;
  const date = new Date(Date.UTC(+a, +me - 1, +d, +h, +mi));
  // Date.UTC aceita 31 de fevereiro e passa para marco; aqui isso e um erro.
  if (date.getUTCMonth() !== +me - 1 || date.getUTCDate() !== +d) return null;
  if (+h > 23 || +mi > 59) return null;
  return date;
}

/** O valor para um <input type="datetime-local">. */
export function toLocalInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/** Agora, no relogio de Lisboa, na mesma convencao das datas guardadas. */
export function nowInLisbon(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')));
}

/** Dias de calendario entre duas datas da mesma convencao (0 = mesmo dia). */
export function daysBetween(from: Date, to: Date): number {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(to) - dia(from)) / 86_400_000);
}

/** "hoje", "amanha", "ontem" ou nada — para o selo ao lado da data. */
export function relativeDay(due: Date, now: Date): string | null {
  const d = daysBetween(now, due);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  return null;
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

/**
 * Le as linhas do formulario de nova encomenda.
 *
 * Os campos chegam como `linha.<n>.recipeId`, `linha.<n>.qty` e
 * `linha.<n>.price`, porque o numero de linhas muda no browser. Preco vazio e
 * `null` — usa o de tabela —, que e diferente de zero (oferecido).
 */
export function readOrderLines(
  form: FormData,
  parseQty: (s: string) => number,
  parseMoney: (s: string) => number,
): Array<{ recipeId: string; qty: number; price: number | null }> {
  const indices = new Set<string>();
  for (const key of form.keys()) {
    const m = /^linha\.(\d+)\.recipeId$/.exec(key);
    if (m) indices.add(m[1]);
  }

  return [...indices]
    .sort((a, b) => Number(a) - Number(b))
    .map((i) => {
      const priceRaw = String(form.get(`linha.${i}.price`) ?? '').trim();
      return {
        recipeId: String(form.get(`linha.${i}.recipeId`) ?? '').trim(),
        qty: parseQty(String(form.get(`linha.${i}.qty`) ?? '')),
        price: priceRaw ? parseMoney(priceRaw) : null,
      };
    })
    .filter((l) => l.recipeId);
}

/**
 * Telefone so com digitos, sem o indicativo de Portugal, para reconhecer o
 * mesmo cliente escrito de duas formas ("+351 912 345 678" e "912345678").
 */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00351')) d = d.slice(5);
  else if (d.startsWith('351') && d.length === 12) d = d.slice(3);
  return d;
}
