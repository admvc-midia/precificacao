import { describe, expect, it } from 'vitest';

import {
  breakEvenPrice,
  classifyMenuItem,
  simulateChannels,
  type GlobalSettings,
} from '@/lib/pricing/channels';
import {
  analyzeManualPrice,
  applyRounding,
  breakdown,
  priceDenominator,
  priceFromTargetCmv,
  priceFromTargetMargin,
  solvePrice,
} from '@/lib/pricing/price';
import type {
  BreakdownCosts,
  ChannelInput,
  PricingParams,
  RecipeCost,
} from '@/lib/pricing/types';

const COSTS: BreakdownCosts = { foodCost: 0.896, packagingCost: 0.12 };

const BASE: PricingParams = {
  vatRate: 0.13,
  vatMode: 'INCLUDED',
  fixedCostRate: 0.22,
  cardFeeRate: 0.012,
  platformFeeRate: 0,
  deliveryCost: 0,
};

describe('autopsia do preco', () => {
  it('fecha a identidade contabil: nada aparece nem desaparece', () => {
    const b = breakdown(10, COSTS, BASE);
    const soma =
      b.fixedCost + b.cardFee + b.platformFee + b.primeCost + b.deliveryCost + b.profit;

    expect(soma).toBeCloseTo(b.net, 10);
    expect(b.gross).toBeCloseTo(b.net + b.vatAmount, 10);
  });

  it('IVA incluido: o preco de menu e o que o cliente paga', () => {
    const b = breakdown(11.3, COSTS, { ...BASE, vatMode: 'INCLUDED' });
    expect(b.gross).toBeCloseTo(11.3, 10);
    expect(b.net).toBeCloseTo(10, 10);
    expect(b.vatAmount).toBeCloseTo(1.3, 10);
  });

  it('IVA acrescido: o preco de menu e a receita liquida', () => {
    const b = breakdown(10, COSTS, { ...BASE, vatMode: 'ADDED' });
    expect(b.net).toBeCloseTo(10, 10);
    expect(b.gross).toBeCloseTo(11.3, 10);
  });

  it('cobra cartao e comissao sobre o bruto, nao sobre o liquido', () => {
    const p = { ...BASE, cardFeeRate: 0.02, platformFeeRate: 0.3 };
    const b = breakdown(11.3, COSTS, p);
    expect(b.cardFee).toBeCloseTo(11.3 * 0.02, 10);
    expect(b.platformFee).toBeCloseTo(11.3 * 0.3, 10);
    // Custos fixos incidem sobre o liquido.
    expect(b.fixedCost).toBeCloseTo(10 * 0.22, 10);
  });
});

describe('modo margem alvo', () => {
  it.each([0.05, 0.1, 0.15, 0.25, 0.4])(
    'entrega a margem pedida, a menos do arredondamento (%s)',
    (margin) => {
      const r = priceFromTargetMargin(COSTS, BASE, margin);
      expect(r.feasible).toBe(true);

      // A formula e exata: sobre o preco antes de arredondar, a margem
      // realizada e o alvo, ate a ultima casa.
      expect(breakdown(r.rawPrice, COSTS, BASE).netMargin).toBeCloseTo(margin, 9);

      // O preco cobrado tem de caber em centimos — nao da para pedir
      // 1,8624 EUR — e esse arredondamento move a margem realizada. O que
      // se garante e que o desvio fica abaixo de 0,2 pontos percentuais.
      expect(Math.abs(r.netMargin - margin)).toBeLessThan(0.002);
      expect(Math.abs(r.price - r.rawPrice)).toBeLessThanOrEqual(0.005);
    },
  );

  it('declara o alvo impossivel em vez de devolver preco negativo', () => {
    const impossivel: PricingParams = {
      vatRate: 0.23,
      vatMode: 'INCLUDED',
      fixedCostRate: 0.4,
      cardFeeRate: 0.02,
      platformFeeRate: 0.3,
      deliveryCost: 0,
    };

    expect(priceDenominator(impossivel, 0.3)).toBeLessThanOrEqual(0);
    expect(solvePrice(1, impossivel, 0.3)).toBeNull();

    const r = priceFromTargetMargin(COSTS, impossivel, 0.3);
    expect(r.feasible).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/impossivel/i);
  });

  it('inclui o frete proprio no preco', () => {
    const semFrete = priceFromTargetMargin(COSTS, BASE, 0.15);
    const comFrete = priceFromTargetMargin(
      COSTS,
      { ...BASE, deliveryCost: 2.5 },
      0.15,
    );
    expect(comFrete.price).toBeGreaterThan(semFrete.price + 2.5);
  });

  it('o preco cresce quando o custo cresce', () => {
    const precos = [0.5, 1, 1.5, 2, 3].map(
      (f) => priceFromTargetMargin({ ...COSTS, foodCost: f }, BASE, 0.15).price,
    );
    for (let i = 0; i < precos.length - 1; i++) {
      expect(precos[i]).toBeLessThan(precos[i + 1]);
    }
  });
});

describe('modo CMV alvo', () => {
  it.each([0.25, 0.3, 0.35])(
    'entrega o CMV pedido, a menos do arredondamento (%s)',
    (cmv) => {
      const r = priceFromTargetCmv(COSTS, BASE, cmv);
      expect(breakdown(r.rawPrice, COSTS, BASE).cmv).toBeCloseTo(cmv, 9);
      expect(Math.abs(r.cmv - cmv)).toBeLessThan(0.002);
    },
  );

  it('coincide com o modo margem quando os alvos descrevem a mesma realidade', () => {
    const porMargem = priceFromTargetMargin(COSTS, BASE, 0.15);
    const porCmv = priceFromTargetCmv(COSTS, BASE, porMargem.cmv);
    expect(porCmv.price).toBeCloseTo(porMargem.price, 7);
  });

  it('avisa quando o CMV pedido leva a prejuizo', () => {
    // Com taxas altas, um CMV "confortavel" ainda pode nao pagar a conta.
    const apertado: PricingParams = {
      ...BASE,
      fixedCostRate: 0.4,
      platformFeeRate: 0.3,
    };
    const r = priceFromTargetCmv(COSTS, apertado, 0.5);
    expect(r.profit).toBeLessThan(0);
    expect(r.warnings.join(' ')).toMatch(/prejuizo/i);
  });

  it('recusa CMV fora do intervalo valido', () => {
    expect(priceFromTargetCmv(COSTS, BASE, 0).feasible).toBe(false);
    expect(priceFromTargetCmv(COSTS, BASE, 1).feasible).toBe(false);
  });
});

describe('modo manual', () => {
  it('denuncia um preco que da prejuizo', () => {
    const r = analyzeManualPrice(1.2, COSTS, BASE);
    expect(r.profit).toBeLessThan(0);
    expect(r.warnings.join(' ')).toMatch(/prejuizo/i);
  });

  it('avisa sobre CMV alto mesmo com lucro positivo', () => {
    // 2,80 deixa lucro confortavel e ainda assim um CMV de ~41%.
    const r = analyzeManualPrice(2.8, COSTS, BASE);
    expect(r.cmv).toBeGreaterThan(0.4);
    expect(r.warnings.join(' ')).toMatch(/CMV/i);
  });
});

describe('arredondamento', () => {
  it('nunca baixa o preco — arredondar para baixo comeria a margem', () => {
    const raw = priceFromTargetMargin(COSTS, BASE, 0.15).price;
    for (const s of ['NEAREST_05', 'NEAREST_10', 'ENDING_90', 'ENDING_95'] as const) {
      expect(applyRounding(raw, s)).toBeGreaterThanOrEqual(raw - 1e-9);
    }
  });

  it('aplica cada estrategia', () => {
    expect(applyRounding(7.12, 'NEAREST_05')).toBeCloseTo(7.15, 10);
    expect(applyRounding(7.12, 'NEAREST_10')).toBeCloseTo(7.2, 10);
    expect(applyRounding(7.12, 'ENDING_90')).toBeCloseTo(7.9, 10);
    expect(applyRounding(7.95, 'ENDING_90')).toBeCloseTo(8.9, 10);
    expect(applyRounding(7.12, 'ENDING_95')).toBeCloseTo(7.95, 10);
    expect(applyRounding(7.12, 'NONE')).toBeCloseTo(7.12, 10);
  });

  it('nao cai por erro de virgula flutuante', () => {
    expect(applyRounding(1.005, 'NONE')).toBeCloseTo(1.01, 10);
  });
});

describe('simulador multi-canal', () => {
  const COST: RecipeCost = {
    recipeId: 'burger',
    name: 'Hamburguer',
    kind: 'PRODUCT',
    yieldQty: 1,
    yieldUnit: 'UN',
    lines: [],
    batchFoodCost: 0.896,
    foodCostPerUnit: 0.896,
    packagingCost: 0.12,
    deliveryPackagingCost: 0.08,
    primeCost: 1.016,
  };

  const SETTINGS: GlobalSettings = {
    vatRate: 0.13,
    vatMode: 'INCLUDED',
    fixedCostRate: 0.22,
    cardFeeRate: 0.012,
    targetCmv: 0.3,
    targetMargin: 0.15,
    rounding: 'NONE',
  };

  const CHANNELS: ChannelInput[] = [
    {
      id: 'balcao',
      name: 'Balcao',
      kind: 'COUNTER',
      commissionRate: 0,
      deliveryCost: 0,
      cardFeeRate: null,
      usesDeliveryPackaging: false,
    },
    {
      id: 'propria',
      name: 'Entrega propria',
      kind: 'OWN_DELIVERY',
      commissionRate: 0,
      deliveryCost: 2.5,
      cardFeeRate: null,
      usesDeliveryPackaging: true,
    },
    {
      id: 'uber',
      name: 'Uber Eats',
      kind: 'PLATFORM',
      commissionRate: 0.3,
      deliveryCost: 0,
      cardFeeRate: 0,
      usesDeliveryPackaging: true,
    },
  ];

  const sim = () =>
    simulateChannels({
      cost: COST,
      settings: SETTINGS,
      channels: CHANNELS,
      mode: 'TARGET_MARGIN',
    });

  it('usa o balcao como canal de referencia', () => {
    expect(sim().reference.channel.id).toBe('balcao');
  });

  it('replica o mesmo lucro em moeda, nao a mesma percentagem', () => {
    const { reference, results } = sim();
    const alvo = reference.suggested.profit;

    for (const r of results) {
      expect(r.profitMatched).not.toBeNull();
      // O preco e sempre arredondado ao centimo — nao da para cobrar
      // 3,4417 EUR — entao o lucro replicado bate a menos de um centimo.
      expect(Math.abs(r.profitMatched!.profit - alvo)).toBeLessThan(0.005);
    }
  });

  it('a margem percentual cai na plataforma, apesar do mesmo lucro', () => {
    const { results } = sim();
    const balcao = results.find((r) => r.channel.id === 'balcao')!;
    const uber = results.find((r) => r.channel.id === 'uber')!;

    expect(uber.profitMatchedPrice!).toBeGreaterThan(balcao.profitMatchedPrice!);
    expect(uber.profitMatched!.netMargin).toBeLessThan(
      balcao.profitMatched!.netMargin,
    );
  });

  it('cobra a embalagem de transporte so nos canais que a usam', () => {
    const { results } = sim();
    const balcao = results.find((r) => r.channel.id === 'balcao')!;
    const uber = results.find((r) => r.channel.id === 'uber')!;

    expect(balcao.costs.packagingCost).toBeCloseTo(0.12, 10);
    expect(uber.costs.packagingCost).toBeCloseTo(0.2, 10);
  });

  it('deixa o canal sobrescrever a taxa de cartao', () => {
    const { results } = sim();
    expect(results.find((r) => r.channel.id === 'uber')!.params.cardFeeRate).toBe(0);
    expect(results.find((r) => r.channel.id === 'balcao')!.params.cardFeeRate).toBe(
      0.012,
    );
  });

  it('vender na plataforma ao preco de balcao destroi o lucro', () => {
    const { results, reference } = sim();
    const uber = results.find((r) => r.channel.id === 'uber')!;

    const aoPrecoDeBalcao = analyzeManualPrice(
      reference.suggested.price,
      uber.costs,
      uber.params,
    );
    expect(aoPrecoDeBalcao.profit).toBeLessThan(reference.suggested.profit);
  });

  it('recusa simular sem nenhum canal', () => {
    expect(() =>
      simulateChannels({
        cost: COST,
        settings: SETTINGS,
        channels: [],
        mode: 'TARGET_CMV',
      }),
    ).toThrow(/canal/i);
  });
});

describe('break-even', () => {
  it('devolve o preco que zera o lucro', () => {
    const be = breakEvenPrice(COSTS, BASE)!;
    // Arredonda para cima ao centimo, entao o lucro fica em zero ou logo acima.
    const b = breakdown(be, COSTS, BASE);
    expect(b.profit).toBeGreaterThanOrEqual(0);
    expect(b.profit).toBeLessThan(0.01);
  });

  it('e menor que o preco com margem alvo', () => {
    expect(breakEvenPrice(COSTS, BASE)!).toBeLessThan(
      priceFromTargetMargin(COSTS, BASE, 0.15).price,
    );
  });

  it('devolve null quando nem cobrir custos e possivel', () => {
    const impossivel: PricingParams = {
      ...BASE,
      fixedCostRate: 0.9,
      platformFeeRate: 0.3,
    };
    expect(breakEvenPrice(COSTS, impossivel)).toBeNull();
  });
});

describe('engenharia de cardapio', () => {
  it('classifica pelos dois eixos', () => {
    expect(classifyMenuItem(5, 3, 100, 50)).toBe('ESTRELA');
    expect(classifyMenuItem(1, 3, 100, 50)).toBe('CAVALO');
    expect(classifyMenuItem(5, 3, 10, 50)).toBe('QUEBRA_CABECA');
    expect(classifyMenuItem(1, 3, 10, 50)).toBe('ABACAXI');
  });
});
