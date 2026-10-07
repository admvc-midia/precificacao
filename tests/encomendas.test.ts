import { describe, expect, it } from 'vitest';

import { parseDecimal, parseQty } from '@/lib/money';
import type { GlobalSettings } from '@/lib/pricing/channels';
import {
  daysBetween,
  grossByMonth,
  normalizePhone,
  nowInLisbon,
  orderResult,
  parseLocalDateTime,
  readOrderLines,
  relativeDay,
  salesByRecipe,
  sumByRecipe,
  typicalMonth,
  type OrderLineInput,
} from '@/lib/pricing/encomendas';
import type { ChannelInput } from '@/lib/pricing/types';

const SETTINGS: GlobalSettings = {
  vatRate: 0.13,
  vatMode: 'INCLUDED',
  fixedCostRate: 0.22,
  cardFeeRate: 0.012,
  targetCmv: 0.3,
  targetMargin: 0.15,
  rounding: 'NONE',
};

const BALCAO: ChannelInput = {
  id: 'b',
  name: 'Balcao',
  kind: 'COUNTER',
  commissionRate: 0,
  deliveryCost: 0,
  cardFeeRate: null,
  usesDeliveryPackaging: false,
};

/** 10 brigadeiros a 1,13 EUR (tabela 1,13), custo 0,20 + 0,05 de caixa. */
const BRIGADEIROS: OrderLineInput = {
  qty: 10,
  unitPrice: 1.13,
  listPrice: 1.13,
  unitFoodCost: 0.2,
  unitPackagingCost: 0.05,
  unitDeliveryPackagingCost: 0.1,
};

describe('orderResult', () => {
  it('faz as contas da encomenda inteira', () => {
    const r = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'PICKUP', paymentMethod: 'CARD', channel: BALCAO },
      SETTINGS,
    );
    expect(r.price).toBeCloseTo(11.3);
    expect(r.net).toBeCloseTo(10);
    expect(r.vatAmount).toBeCloseTo(1.3);
    expect(r.foodCost).toBeCloseTo(2);
    expect(r.packagingCost).toBeCloseTo(0.5);
    expect(r.fixedCost).toBeCloseTo(2.2);
    expect(r.cardFee).toBeCloseTo(11.3 * 0.012);
    // 10 - 2,2 - 0,1356 - 2,5
    expect(r.profit).toBeCloseTo(10 - 2.2 - 0.1356 - 2.5);
    expect(r.discount).toBeCloseTo(0);
  });

  it('so cobra a taxa de cartao a quem paga com cartao', () => {
    const mbway = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'PICKUP', paymentMethod: 'MBWAY', channel: BALCAO },
      SETTINGS,
    );
    expect(mbway.cardFee).toBe(0);
    expect(mbway.cardFeeApplied).toBe(false);
  });

  it('sem saber como paga, conta com a taxa (o lado prudente)', () => {
    const r = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'PICKUP', paymentMethod: null, channel: BALCAO },
      SETTINGS,
    );
    expect(r.cardFeeApplied).toBe(true);
    expect(r.cardFee).toBeGreaterThan(0);
  });

  it('a embalagem de transporte so entra quando se entrega', () => {
    const levanta = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'PICKUP', paymentMethod: 'CASH', channel: BALCAO },
      SETTINGS,
    );
    const entrega = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'DELIVERY', paymentMethod: 'CASH', channel: BALCAO },
      SETTINGS,
    );
    expect(entrega.packagingCost - levanta.packagingCost).toBeCloseTo(1);
  });

  it('o frete do canal paga-se uma vez por encomenda, nao por unidade', () => {
    const proprio: ChannelInput = { ...BALCAO, kind: 'OWN_DELIVERY', deliveryCost: 3 };
    const r = orderResult(
      { lines: [BRIGADEIROS], fulfillment: 'DELIVERY', paymentMethod: 'CASH', channel: proprio },
      SETTINGS,
    );
    expect(r.deliveryCost).toBe(3);
  });

  it('mostra o desconto face a tabela', () => {
    const r = orderResult(
      {
        lines: [{ ...BRIGADEIROS, unitPrice: 1 }],
        fulfillment: 'PICKUP',
        paymentMethod: 'CASH',
        channel: BALCAO,
      },
      SETTINGS,
    );
    expect(r.listTotal).toBeCloseTo(11.3);
    expect(r.discount).toBeCloseTo(1.3);
  });

  it('linhas sem preco de tabela nao inventam desconto', () => {
    const r = orderResult(
      {
        lines: [{ ...BRIGADEIROS, listPrice: null, unitPrice: 2 }],
        fulfillment: 'PICKUP',
        paymentMethod: 'CASH',
        channel: BALCAO,
      },
      SETTINGS,
    );
    expect(r.discount).toBe(0);
  });
});

describe('salesByRecipe e sumByRecipe', () => {
  it('soma por produto, com a receita bruta na convencao do IVA', () => {
    const linhas = [
      { recipeId: 'a', qty: 2, unitPrice: 10 },
      { recipeId: 'a', qty: 1, unitPrice: 8 },
      { recipeId: 'b', qty: 5, unitPrice: 1 },
    ];
    const incluido = salesByRecipe(linhas, SETTINGS);
    expect(incluido.get('a')).toEqual({ qty: 3, gross: 28 });

    const acrescido = salesByRecipe(linhas, { vatMode: 'ADDED', vatRate: 0.13 });
    expect(acrescido.get('b')!.gross).toBeCloseTo(5.65);

    expect(sumByRecipe(linhas)).toEqual([
      { recipeId: 'a', qty: 3 },
      { recipeId: 'b', qty: 5 },
    ]);
  });
});

describe('grossByMonth e typicalMonth', () => {
  const linhas = [
    { deliveredAt: new Date('2026-08-10T10:00:00Z'), qty: 10, unitPrice: 100 },
    { deliveredAt: new Date('2026-09-02T10:00:00Z'), qty: 20, unitPrice: 100 },
    // 22:00 UTC = 23:00 em Lisboa (verao): ainda setembro. As 23:00 UTC ja era outubro.
    { deliveredAt: new Date('2026-09-30T22:00:00Z'), qty: 10, unitPrice: 100 },
    { deliveredAt: new Date('2026-10-01T10:00:00Z'), qty: 1, unitPrice: 100 },
  ];
  const porMes = grossByMonth(linhas, SETTINGS);

  it('soma a faturacao de cada mes', () => {
    expect(porMes.get('2026-08')).toBe(1000);
    expect(porMes.get('2026-09')).toBe(3000);
    expect(porMes.get('2026-10')).toBe(100);
  });

  it('o mes e o de Lisboa: 23:00 UTC de 30/9 ja e 1 de outubro', () => {
    const m = grossByMonth([{ deliveredAt: new Date('2026-09-30T23:00:00Z'), qty: 1, unitPrice: 50 }], SETTINGS);
    expect([...m.keys()]).toEqual(['2026-10']);
  });

  it('o mes a meio fica de fora quando ha meses fechados', () => {
    expect(typicalMonth(porMes, '2026-10')).toEqual({
      average: 2000,
      months: ['2026-09', '2026-08'],
    });
  });

  it('so com o mes corrente, usa-o (melhor do que nada)', () => {
    const so = grossByMonth([linhas[3]], SETTINGS);
    expect(typicalMonth(so, '2026-10')).toEqual({ average: 100, months: ['2026-10'] });
    expect(typicalMonth(new Map(), '2026-10')).toBeNull();
  });

  it('no maximo os tres ultimos meses fechados', () => {
    const m = new Map([
      ['2026-05', 1],
      ['2026-06', 10],
      ['2026-07', 20],
      ['2026-08', 30],
    ]);
    expect(typicalMonth(m, '2026-10')!.months).toEqual(['2026-08', '2026-07', '2026-06']);
  });
});

describe('datas', () => {
  it('le o datetime-local como relogio de parede em UTC', () => {
    expect(parseLocalDateTime('2026-10-08T15:30')!.toISOString()).toBe('2026-10-08T15:30:00.000Z');
    expect(parseLocalDateTime('2026-10-08')!.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('recusa datas que nao existem', () => {
    expect(parseLocalDateTime('2026-02-31T10:00')).toBeNull();
    expect(parseLocalDateTime('')).toBeNull();
    expect(parseLocalDateTime('amanha')).toBeNull();
  });

  it('agora em Lisboa: hora de verao e de inverno', () => {
    // 6 out, 12:00 UTC -> 13:00 em Lisboa (verao)
    expect(nowInLisbon(new Date('2026-10-06T12:00:00Z')).toISOString()).toBe(
      '2026-10-06T13:00:00.000Z',
    );
    // 6 dez, 12:00 UTC -> 12:00 em Lisboa (inverno)
    expect(nowInLisbon(new Date('2026-12-06T12:00:00Z')).toISOString()).toBe(
      '2026-12-06T12:00:00.000Z',
    );
  });

  it('hoje, amanha, ontem — por dia de calendario, nao por 24 horas', () => {
    const agora = new Date('2026-10-06T23:00:00Z');
    expect(relativeDay(new Date('2026-10-07T08:00:00Z'), agora)).toBe('amanhã');
    expect(relativeDay(new Date('2026-10-06T08:00:00Z'), agora)).toBe('hoje');
    expect(relativeDay(new Date('2026-10-05T08:00:00Z'), agora)).toBe('ontem');
    expect(relativeDay(new Date('2026-10-09T08:00:00Z'), agora)).toBeNull();
    expect(daysBetween(agora, new Date('2026-10-09T00:00:00Z'))).toBe(3);
  });
});

describe('readOrderLines', () => {
  it('le as linhas pela ordem, com preco vazio como null (≠ zero)', () => {
    const f = new FormData();
    f.set('linha.2.recipeId', 'b');
    f.set('linha.2.qty', '0.5');
    f.set('linha.2.price', '0');
    f.set('linha.0.recipeId', 'a');
    f.set('linha.0.qty', '12');
    f.set('linha.0.price', '');
    f.set('linha.1.recipeId', '');
    f.set('linha.1.qty', '3');

    expect(readOrderLines(f, parseQty, parseDecimal)).toEqual([
      { recipeId: 'a', qty: 12, price: null },
      { recipeId: 'b', qty: 0.5, price: 0 },
    ]);
  });

  it('o preco le-se como dinheiro: 1.500 sao mil e quinhentos', () => {
    const f = new FormData();
    f.set('linha.0.recipeId', 'a');
    f.set('linha.0.qty', '1');
    f.set('linha.0.price', '1.500');
    expect(readOrderLines(f, parseQty, parseDecimal)[0].price).toBe(1500);
  });
});

describe('normalizePhone', () => {
  it('reconhece o mesmo numero escrito de varias formas', () => {
    expect(normalizePhone('+351 912 345 678')).toBe('912345678');
    expect(normalizePhone('00351912345678')).toBe('912345678');
    expect(normalizePhone('912-345-678')).toBe('912345678');
    // Um numero brasileiro fica como esta.
    expect(normalizePhone('+55 11 98765 4321')).toBe('5511987654321');
  });
});
