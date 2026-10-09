import { describe, expect, it } from 'vitest';

import type { GlobalSettings } from '@/lib/pricing/channels';
import {
  average,
  customerStats,
  daysUntilBirthday,
  fillMessage,
  firstName,
  followUpDate,
  listProducts,
  MENSAGEM_POS_VENDA,
  parseRating,
  productRatings,
  validBirthday,
  lerLinkAvaliacao,
  mensagemPosVenda,
} from '@/lib/pricing/clientes';
import { monthsBetween, salesReport, type ReportOrder } from '@/lib/pricing/relatorio';

const SETTINGS: GlobalSettings = {
  vatRate: 0.13,
  vatMode: 'INCLUDED',
  fixedCostRate: 0.22,
  cardFeeRate: 0.012,
  targetCmv: 0.3,
  targetMargin: 0.15,
  rounding: 'NONE',
};

describe('mensagem do pos-venda', () => {
  it('troca as chavetas e deixa as desconhecidas', () => {
    expect(fillMessage('Olá {nome}, {nme}!', { nome: 'Ana' })).toBe('Olá Ana, {nme}!');
  });

  it('a mensagem de origem usa as quatro chaves', () => {
    const m = fillMessage(MENSAGEM_POS_VENDA, {
      nome: 'Ana',
      loja: 'Amo Brigs',
      produtos: 'o Bolo',
      dia: 'sábado',
    });
    expect(m).not.toMatch(/\{\w+\}/);
    expect(m).toContain('Ana');
    expect(m).toContain('Amo Brigs');
  });

  it('lista de produtos legivel', () => {
    expect(listProducts([{ name: 'Bolo', qty: 1 }])).toBe('Bolo');
    expect(
      listProducts([
        { name: 'Bolo', qty: 1 },
        { name: 'Brigadeiros', qty: 20 },
        { name: 'Tarte', qty: 1.5 },
      ]),
    ).toBe('Bolo, 20 Brigadeiros e 1,5 Tarte');
    expect(listProducts([])).toBe('a encomenda');
  });

  it('primeiro nome', () => {
    expect(firstName('  Maria da Conceição Silva ')).toBe('Maria');
  });
});

describe('datas do pos-venda', () => {
  it('perguntar N dias depois da entrega', () => {
    expect(followUpDate(new Date('2026-10-06T22:55:00Z'), 2).toISOString()).toBe(
      '2026-10-08T22:55:00.000Z',
    );
  });

  it('aniversarios validos, incluindo 29 de fevereiro', () => {
    expect(validBirthday(29, 2)).toBe(true);
    expect(validBirthday(30, 2)).toBe(false);
    expect(validBirthday(31, 4)).toBe(false);
    expect(validBirthday(0, 1)).toBe(false);
    expect(validBirthday(12, 13)).toBe(false);
  });

  it('dias ate ao aniversario, a passar o fim do ano', () => {
    const hoje = new Date('2026-10-07T00:00:00Z');
    expect(daysUntilBirthday(7, 10, hoje)).toBe(0);
    expect(daysUntilBirthday(12, 10, hoje)).toBe(5);
    // Ja passou este ano: conta para o proximo.
    expect(daysUntilBirthday(6, 10, hoje)).toBe(364);
    expect(daysUntilBirthday(2, 1, new Date('2026-12-30T00:00:00Z'))).toBe(3);
  });

  it('29 de fevereiro festeja-se a 28 nos anos comuns', () => {
    expect(daysUntilBirthday(29, 2, new Date('2027-02-27T00:00:00Z'))).toBe(1);
    expect(daysUntilBirthday(29, 2, new Date('2028-02-27T00:00:00Z'))).toBe(2);
  });
});

describe('notas', () => {
  it('le de 1 a 5, vazio e nulo, o resto e erro', () => {
    expect(parseRating('4')).toBe(4);
    expect(parseRating('')).toBeNull();
    expect(parseRating(undefined)).toBeNull();
    expect(() => parseRating('6')).toThrow();
    expect(() => parseRating('3.5')).toThrow();
  });

  it('media ignora quem nao foi avaliado', () => {
    expect(average([5, null, 3])).toBe(4);
    expect(average([null])).toBeNull();
  });

  it('nota por produto: a do produto, ou a geral se a encomenda so o tinha a ele', () => {
    const r = productRatings([
      { recipeId: 'bolo', rating: 5, orderRating: 3, linesInOrder: 2 },
      { recipeId: 'tarte', rating: null, orderRating: 3, linesInOrder: 2 },
      { recipeId: 'bolo', rating: null, orderRating: 4, linesInOrder: 1 },
    ]);
    expect(r.get('bolo')).toEqual({ average: 4.5, count: 2 });
    // Numa encomenda de dois produtos a geral nao se reparte.
    expect(r.has('tarte')).toBe(false);
  });
});

describe('customerStats', () => {
  it('so as entregues contam', () => {
    const s = customerStats([
      { status: 'DELIVERED', dueAt: new Date('2026-09-01'), deliveredAt: new Date('2026-09-01'), gross: 60, rating: 5 },
      { status: 'DELIVERED', dueAt: new Date('2026-10-01'), deliveredAt: new Date('2026-10-02'), gross: 40, rating: null },
      { status: 'CANCELLED', dueAt: new Date('2026-10-05'), deliveredAt: null, gross: 999, rating: null },
    ]);
    expect(s).toEqual({
      orders: 2,
      spent: 100,
      averageTicket: 50,
      lastOrder: new Date('2026-10-02'),
      averageRating: 5,
      ratings: 1,
    });
  });
});

describe('relatorio', () => {
  const linha = (recipeId: string, qty: number, unitPrice: number) => ({
    recipeId,
    recipeName: recipeId,
    qty,
    unitPrice,
    listPrice: unitPrice,
    unitFoodCost: 1,
    unitPackagingCost: 0,
    unitDeliveryPackagingCost: 0,
  });
  const ana = { id: 'ana', name: 'Ana', source: 'INSTAGRAM' as const, referredBy: null };
  const rui = { id: 'rui', name: 'Rui', source: 'REFERRAL' as const, referredBy: { id: 'ana', name: 'Ana' } };

  const encomendas: ReportOrder[] = [
    { deliveredAt: new Date('2026-09-10T10:00:00Z'), fulfillment: 'PICKUP', paymentMethod: 'CASH', channel: null, customer: ana, lines: [linha('bolo', 1, 11.3)] },
    { deliveredAt: new Date('2026-10-02T10:00:00Z'), fulfillment: 'PICKUP', paymentMethod: 'CASH', channel: null, customer: ana, lines: [linha('bolo', 2, 11.3)] },
    { deliveredAt: new Date('2026-10-03T10:00:00Z'), fulfillment: 'PICKUP', paymentMethod: 'CASH', channel: null, customer: rui, lines: [linha('tarte', 1, 22.6)] },
  ];

  it('meses do periodo, a passar o ano', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-10', '2026-10')).toEqual(['2026-10']);
  });

  it('soma por mes (com os vazios), produto, cliente, origem e quem indica', () => {
    const r = salesReport(encomendas, SETTINGS, monthsBetween('2026-08', '2026-10'));

    expect(r.total.orders).toBe(3);
    expect(r.total.gross).toBeCloseTo(56.5);
    expect(r.total.units).toBe(4);
    expect(r.total.averageTicket).toBeCloseTo(56.5 / 3);

    expect(r.byMonth.map((m) => [m.month, m.orders])).toEqual([
      ['2026-08', 0],
      ['2026-09', 1],
      ['2026-10', 2],
    ]);

    const bolo = r.byProduct.find((p) => p.id === 'bolo')!;
    expect(bolo.units).toBe(3);
    // 3 bolos a 1 EUR de custo, sobre 30 EUR sem IVA.
    expect(bolo.cmv).toBeCloseTo(0.1);

    expect(r.byCustomer[0]).toMatchObject({ id: 'ana', orders: 2 });
    expect(r.bySource.find((s) => s.source === 'REFERRAL')).toMatchObject({ customers: 1 });
    expect(r.byReferrer).toEqual([expect.objectContaining({ id: 'ana', customers: 1 })]);
    expect(r.byReferrer[0].gross).toBeCloseTo(22.6);
  });
});

describe('avaliacao no Google no pos-venda', () => {
  const vars = { nome: 'Ana', loja: 'AmoBrigs', produtos: 'o Bolo', dia: 'sábado' };
  const link = 'https://g.page/r/abc/review';

  it('sem {avaliacao} na mensagem, junta a linha no fim', () => {
    const m = mensagemPosVenda('Olá {nome}!', vars, link);
    expect(m).toBe(`Olá Ana!\nSe gostou, deixe-nos uma avaliação no Google — ajuda muito quem nos procura: ${link}`);
  });
  it('com {avaliacao}, usa-a no sitio escrito', () => {
    expect(mensagemPosVenda('Olá {nome}! Avalie: {avaliacao}', vars, link)).toBe(`Olá Ana! Avalie: ${link}`);
  });
  it('sem link, as linhas com {avaliacao} saem inteiras', () => {
    expect(mensagemPosVenda('Olá {nome}!\nAvalie: {avaliacao}\nObrigada', vars, null)).toBe('Olá Ana!\nObrigada');
    expect(mensagemPosVenda('Olá {nome}!', vars, '  ')).toBe('Olá Ana!');
  });
  it('o link tem de ser do Google', () => {
    expect(lerLinkAvaliacao('g.page/r/abc/review')).toBe('https://g.page/r/abc/review');
    expect(lerLinkAvaliacao('http://search.google.com/local/writereview?placeid=X')).toBe('https://search.google.com/local/writereview?placeid=X');
    expect(lerLinkAvaliacao('')).toBeNull();
    expect(() => lerLinkAvaliacao('https://exemplo.pt/review')).toThrow(/Google/);
  });
});
