/**
 * Relatorio de vendas: as encomendas entregues num periodo, somadas por mes,
 * produto, cliente, origem e canal.
 *
 * Tudo sai de `orderResult`, com os custos congelados de cada linha — o
 * relatorio de setembro nao muda porque a farinha subiu em outubro.
 */

import { mesEmLisboa } from '@/lib/datas';

import type { GlobalSettings } from './channels';
import type { CustomerSource } from './clientes';
import {
  grossOf,
  orderResult,
  type Fulfillment,
  type OrderLineInput,
  type PaymentMethod,
} from './encomendas';
import type { ChannelInput } from './types';

export interface ReportOrder {
  deliveredAt: Date;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod | null;
  channel: ChannelInput | null;
  customer: {
    id: string;
    name: string;
    source: CustomerSource | null;
    referredBy: { id: string; name: string } | null;
  } | null;
  lines: Array<OrderLineInput & { recipeId: string; recipeName: string }>;
}

export interface Soma {
  orders: number;
  gross: number;
  net: number;
  profit: number;
}

const zero = (): Soma => ({ orders: 0, gross: 0, net: 0, profit: 0 });

/** Os meses de `de` a `ate`, inclusive: ["2026-08", "2026-09", "2026-10"]. */
export function monthsBetween(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aFim, mFim] = ate.split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
    if (out.length > 120) break; // dez anos chegam; protege de um "ate" absurdo
  }
  return out;
}

export function salesReport(orders: ReportOrder[], settings: GlobalSettings, months: string[]) {
  const total = { ...zero(), units: 0, discount: 0 };
  const porMes = new Map(months.map((m) => [m, zero()]));
  const porProduto = new Map<
    string,
    { name: string; units: number; gross: number; net: number; cost: number }
  >();
  const porCliente = new Map<string, Soma & { name: string; last: Date }>();
  const porOrigem = new Map<CustomerSource | 'NONE', Soma & { customers: Set<string> }>();
  const porIndicador = new Map<string, Soma & { name: string; customers: Set<string> }>();
  const porCanal = new Map<string, Soma>();

  const somar = (s: Soma, r: { gross: number; net: number; profit: number }) => {
    s.orders += 1;
    s.gross += r.gross;
    s.net += r.net;
    s.profit += r.profit;
  };

  for (const o of orders) {
    const r = orderResult(
      {
        lines: o.lines,
        fulfillment: o.fulfillment,
        paymentMethod: o.paymentMethod,
        channel: o.channel,
      },
      settings,
    );

    somar(total, r);
    total.discount += Math.max(0, r.discount);

    const mes = porMes.get(mesEmLisboa(o.deliveredAt));
    if (mes) somar(mes, r);

    const comTransporte = r.deliveryPackaging;
    for (const l of o.lines) {
      total.units += l.qty;
      const p = porProduto.get(l.recipeId) ?? { name: l.recipeName, units: 0, gross: 0, net: 0, cost: 0 };
      const bruto = grossOf(l.qty * l.unitPrice, settings);
      p.units += l.qty;
      p.gross += bruto;
      p.net += settings.vatMode === 'INCLUDED' ? bruto / (1 + settings.vatRate) : l.qty * l.unitPrice;
      p.cost +=
        l.qty *
        (l.unitFoodCost + l.unitPackagingCost + (comTransporte ? l.unitDeliveryPackagingCost : 0));
      porProduto.set(l.recipeId, p);
    }

    const canal = o.channel?.name ?? 'Sem canal';
    const c = porCanal.get(canal) ?? zero();
    somar(c, r);
    porCanal.set(canal, c);

    if (o.customer) {
      const cl = porCliente.get(o.customer.id) ?? { ...zero(), name: o.customer.name, last: o.deliveredAt };
      somar(cl, r);
      if (o.deliveredAt > cl.last) cl.last = o.deliveredAt;
      porCliente.set(o.customer.id, cl);

      const origem = o.customer.source ?? 'NONE';
      const og = porOrigem.get(origem) ?? { ...zero(), customers: new Set<string>() };
      somar(og, r);
      og.customers.add(o.customer.id);
      porOrigem.set(origem, og);

      const ind = o.customer.referredBy;
      if (ind) {
        const pi = porIndicador.get(ind.id) ?? { ...zero(), name: ind.name, customers: new Set<string>() };
        somar(pi, r);
        pi.customers.add(o.customer.id);
        porIndicador.set(ind.id, pi);
      }
    }
  }

  const desc = <T extends { gross: number }>(a: T, b: T) => b.gross - a.gross;

  return {
    total: {
      ...total,
      averageTicket: total.orders > 0 ? total.gross / total.orders : 0,
    },
    byMonth: months.map((m) => ({ month: m, ...porMes.get(m)! })),
    byProduct: [...porProduto]
      .map(([id, p]) => ({ id, ...p, cmv: p.net > 0 ? p.cost / p.net : 0 }))
      .sort(desc),
    byCustomer: [...porCliente].map(([id, c]) => ({ id, ...c })).sort(desc),
    bySource: [...porOrigem]
      .map(([source, s]) => ({ source, ...s, customers: s.customers.size }))
      .sort(desc),
    byReferrer: [...porIndicador]
      .map(([id, s]) => ({ id, ...s, customers: s.customers.size }))
      .sort((a, b) => b.customers - a.customers || b.gross - a.gross),
    byChannel: [...porCanal].map(([name, s]) => ({ name, ...s })).sort(desc),
  };
}
