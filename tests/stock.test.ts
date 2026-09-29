import { describe, expect, it } from 'vitest';

import {
  applyMovement,
  finalStates,
  planMovements,
  computeVariance,
  EMPTY_STOCK,
  inventoryAdjustment,
  replayMovements,
  type MovementInput,
  type StockState,
} from '@/lib/pricing/stock';

const entrada = (qtyBase: number, unitCost: number): MovementInput => ({
  kind: 'PURCHASE',
  qtyBase,
  unitCost,
});

const saida = (qtyBase: number): MovementInput => ({
  kind: 'PRODUCTION',
  qtyBase: -Math.abs(qtyBase),
});

describe('custo medio ponderado', () => {
  it('a primeira entrada define o custo medio', () => {
    const { state } = applyMovement(EMPTY_STOCK, entrada(5000, 0.0025));
    expect(state.qtyBase).toBe(5000);
    expect(state.avgUnitCost).toBeCloseTo(0.0025, 10);
  });

  it('uma entrada mais cara dilui o que ja estava', () => {
    // 5 kg a 0,0025/g, depois 5 kg a 0,0035/g -> medio 0,0030/g
    let s: StockState = applyMovement(EMPTY_STOCK, entrada(5000, 0.0025)).state;
    s = applyMovement(s, entrada(5000, 0.0035)).state;

    expect(s.qtyBase).toBe(10000);
    expect(s.avgUnitCost).toBeCloseTo(0.003, 10);
  });

  it('pondera pelas quantidades, nao pela media simples dos precos', () => {
    // 9 kg a 1,00 e 1 kg a 2,00 -> 1,10 e nao 1,50
    let s = applyMovement(EMPTY_STOCK, entrada(9, 1)).state;
    s = applyMovement(s, entrada(1, 2)).state;
    expect(s.avgUnitCost).toBeCloseTo(1.1, 10);
  });

  it('a saida valoriza ao medio e nao o altera', () => {
    let s = applyMovement(EMPTY_STOCK, entrada(5000, 0.0025)).state;
    s = applyMovement(s, entrada(5000, 0.0035)).state;

    const r = applyMovement(s, saida(2000));
    expect(r.unitCost).toBeCloseTo(0.003, 10);
    expect(r.value).toBeCloseTo(-6, 10); // 2000 g x 0,003
    expect(r.state.qtyBase).toBe(8000);
    expect(r.state.avgUnitCost).toBeCloseTo(0.003, 10); // inalterado
  });

  it('esvaziar e voltar a encher redefine o medio', () => {
    let s = applyMovement(EMPTY_STOCK, entrada(1000, 2)).state;
    s = applyMovement(s, saida(1000)).state;
    expect(s.qtyBase).toBe(0);

    s = applyMovement(s, entrada(1000, 5)).state;
    // Com o armazem vazio, o medio antigo nao tem peso nenhum.
    expect(s.avgUnitCost).toBeCloseTo(5, 10);
  });

  it('saldo sem base de custo nao dilui a entrada', () => {
    // Estoque inicial digitado a mao: quantidade sim, custo nao. Zero ali
    // quer dizer "desconhecido", e ponderar contra ele afundaria o preco.
    const inicial: StockState = { qtyBase: 8000, avgUnitCost: 0 };
    const s = applyMovement(inicial, entrada(1000, 0.003)).state;

    expect(s.qtyBase).toBe(9000);
    expect(s.avgUnitCost).toBeCloseTo(0.003, 10);
    // A media ingenua daria 0,000333 — trinta vezes menos.
    expect(s.avgUnitCost).toBeGreaterThan(0.001);
  });

  it('aguenta estoque negativo sem produzir custos absurdos', () => {
    // Produziu-se antes de registar a compra.
    const r = applyMovement(EMPTY_STOCK, saida(500));
    expect(r.state.qtyBase).toBe(-500);
    expect(Number.isFinite(r.state.avgUnitCost)).toBe(true);

    // A compra chega depois: o medio passa a ser o preco dela, nao NaN.
    const s = applyMovement(r.state, entrada(1000, 3)).state;
    expect(s.qtyBase).toBe(500);
    expect(s.avgUnitCost).toBeCloseTo(3, 10);
  });

  it('movimento de quantidade zero nao mexe no estado', () => {
    const s = applyMovement(EMPTY_STOCK, entrada(1000, 2)).state;
    const r = applyMovement(s, { kind: 'ADJUSTMENT', qtyBase: 0 });
    expect(r.state).toEqual(s);
    expect(r.value).toBe(0);
  });

  it('o valor do estoque bate com quantidade x medio', () => {
    let s = applyMovement(EMPTY_STOCK, entrada(5000, 0.0025)).state;
    s = applyMovement(s, entrada(3000, 0.004)).state;
    s = applyMovement(s, saida(1500)).state;

    const gasto = 5000 * 0.0025 + 3000 * 0.004;
    const consumido = 1500 * ((5000 * 0.0025 + 3000 * 0.004) / 8000);
    expect(s.qtyBase * s.avgUnitCost).toBeCloseTo(gasto - consumido, 8);
  });

  it('replay de uma sequencia da o mesmo que aplicar uma a uma', () => {
    const movs = [entrada(1000, 2), saida(300), entrada(500, 5), saida(200)];
    const viaReplay = replayMovements(movs);

    let s = EMPTY_STOCK;
    for (const m of movs) s = applyMovement(s, m).state;

    expect(viaReplay.qtyBase).toBeCloseTo(s.qtyBase, 10);
    expect(viaReplay.avgUnitCost).toBeCloseTo(s.avgUnitCost, 10);
  });
});

describe('contagem de inventario', () => {
  it('gera o ajuste que leva ao valor contado', () => {
    const s: StockState = { qtyBase: 8000, avgUnitCost: 0.003 };
    const mv = inventoryAdjustment(s, 7600)!;

    expect(mv.kind).toBe('INVENTORY');
    expect(mv.qtyBase).toBeCloseTo(-400, 10);
    expect(applyMovement(s, mv).state.qtyBase).toBeCloseTo(7600, 10);
  });

  it('sobra encontrada entra ao medio corrente', () => {
    const s: StockState = { qtyBase: 100, avgUnitCost: 4 };
    const mv = inventoryAdjustment(s, 130)!;
    expect(mv.qtyBase).toBeCloseTo(30, 10);
    expect(applyMovement(s, mv).state.avgUnitCost).toBeCloseTo(4, 10);
  });

  it('nao gera movimento quando a contagem confirma o saldo', () => {
    expect(inventoryAdjustment({ qtyBase: 500, avgUnitCost: 1 }, 500)).toBeNull();
  });
});

describe('CMV teorico x real', () => {
  it('a quebra entra no custo real', () => {
    const v = computeVariance({
      theoreticalCost: 1000,
      actualProductionCost: 1050,
      wasteCost: 70,
      netRevenue: 4000,
    });

    expect(v.actualCost).toBeCloseTo(1120, 10);
    expect(v.gap).toBeCloseTo(120, 10);
    expect(v.gapRate).toBeCloseTo(0.12, 10);
  });

  it('exprime os dois CMV sobre a receita liquida', () => {
    const v = computeVariance({
      theoreticalCost: 1200,
      actualProductionCost: 1200,
      wasteCost: 0,
      netRevenue: 4000,
    });

    expect(v.theoreticalCmv).toBeCloseTo(0.3, 10);
    expect(v.actualCmv).toBeCloseTo(0.3, 10);
    expect(v.cmvGapPoints).toBeCloseTo(0, 10);
  });

  it('um desvio de 3 pontos de CMV aparece como 3 pontos', () => {
    const v = computeVariance({
      theoreticalCost: 1200,
      actualProductionCost: 1320,
      wasteCost: 0,
      netRevenue: 4000,
    });
    expect(v.cmvGapPoints).toBeCloseTo(0.03, 10);
  });

  it('gastar menos que a ficha da desvio negativo', () => {
    const v = computeVariance({
      theoreticalCost: 1000,
      actualProductionCost: 940,
      wasteCost: 0,
      netRevenue: 3000,
    });
    expect(v.gap).toBeLessThan(0);
  });

  it('o que foi oferecido nao entra no CMV', () => {
    const semAmostras = computeVariance({
      theoreticalCost: 1000,
      actualProductionCost: 1000,
      wasteCost: 0,
      netRevenue: 4000,
    });

    const comAmostras = computeVariance({
      theoreticalCost: 1000,
      actualProductionCost: 1000,
      wasteCost: 0,
      promoCost: 300,
      netRevenue: 4000,
    });

    // Uma campanha de amostras nao pode fazer o CMV disparar: saiu do
    // armazem, mas nao houve venda a que associar o custo.
    expect(comAmostras.actualCmv).toBeCloseTo(semAmostras.actualCmv, 10);
    expect(comAmostras.gap).toBeCloseTo(semAmostras.gap, 10);
    // Mas o valor continua a ser reportado.
    expect(comAmostras.promoCost).toBeCloseTo(300, 10);
  });

  it('sem receita nao inventa percentagens', () => {
    const v = computeVariance({
      theoreticalCost: 500,
      actualProductionCost: 500,
      wasteCost: 0,
      netRevenue: 0,
    });
    expect(v.theoreticalCmv).toBe(0);
    expect(v.actualCmv).toBe(0);
  });
});

describe('plano de movimentos', () => {
  const estado = () =>
    new Map<string, StockState>([
      ['carne', { qtyBase: 8000, avgUnitCost: 0.0025 }],
      ['pao', { qtyBase: 0, avgUnitCost: 0 }],
    ]);

  it('encadeia varios movimentos do mesmo insumo pela ordem dada', () => {
    const plano = planMovements(estado(), [
      { ingredientId: 'carne', kind: 'PURCHASE', qtyBase: 2000, unitCost: 0.005 },
      { ingredientId: 'carne', kind: 'PRODUCTION', qtyBase: -1000 },
    ]);

    expect(plano).toHaveLength(2);
    // Media apos a entrada: (8000 x 0,0025 + 2000 x 0,005) / 10000 = 0,003
    expect(plano[0].finalAvgCost).toBeCloseTo(0.003, 10);
    expect(plano[1].finalQtyBase).toBeCloseTo(9000, 10);
    // A saida foi valorizada a media de entao, nao a media inicial.
    expect(plano[1].unitCost).toBeCloseTo(0.003, 10);
  });

  it('da o mesmo resultado que aplicar um a um', () => {
    const entradas = [
      { ingredientId: 'carne' as const, kind: 'PURCHASE' as const, qtyBase: 2000, unitCost: 0.005 },
      { ingredientId: 'carne' as const, kind: 'PRODUCTION' as const, qtyBase: -1500 },
      { ingredientId: 'carne' as const, kind: 'WASTE' as const, qtyBase: -200 },
    ];

    const plano = planMovements(estado(), entradas);
    const final = finalStates(plano).get('carne')!;

    let s: StockState = estado().get('carne')!;
    for (const e of entradas) {
      s = applyMovement(s, { kind: e.kind, qtyBase: e.qtyBase, unitCost: e.unitCost }).state;
    }

    expect(final.qtyBase).toBeCloseTo(s.qtyBase, 10);
    expect(final.avgUnitCost).toBeCloseTo(s.avgUnitCost, 10);
  });

  it('insumo desconhecido parte do zero em vez de estourar', () => {
    const plano = planMovements(estado(), [
      { ingredientId: 'novo', kind: 'PURCHASE', qtyBase: 100, unitCost: 2 },
    ]);
    expect(plano[0].finalQtyBase).toBe(100);
    expect(plano[0].finalAvgCost).toBeCloseTo(2, 10);
  });

  it('ignora movimentos de quantidade zero', () => {
    const plano = planMovements(estado(), [
      { ingredientId: 'carne', kind: 'ADJUSTMENT', qtyBase: 0 },
      { ingredientId: 'pao', kind: 'PURCHASE', qtyBase: 24, unitCost: 0.15 },
    ]);
    expect(plano).toHaveLength(1);
    expect(plano[0].ingredientId).toBe('pao');
  });

  it('finalStates devolve o saldo de cada insumo tocado', () => {
    const plano = planMovements(estado(), [
      { ingredientId: 'carne', kind: 'PRODUCTION', qtyBase: -500 },
      { ingredientId: 'pao', kind: 'PURCHASE', qtyBase: 24, unitCost: 0.15 },
    ]);
    const finais = finalStates(plano);

    expect(finais.size).toBe(2);
    expect(finais.get('carne')!.qtyBase).toBeCloseTo(7500, 10);
    expect(finais.get('pao')!.qtyBase).toBeCloseTo(24, 10);
  });
});
