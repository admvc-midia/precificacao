/**
 * Estoque: saldo, custo medio e variancia.
 *
 * ---------------------------------------------------------------------------
 * PORQUE CUSTO MEDIO PONDERADO
 * ---------------------------------------------------------------------------
 * O resto da aplicacao calcula custos a partir de `purchasePrice`, que e o
 * preco da **proxima** compra. Para saber quanto valeu o que saiu do armazem
 * isso nao serve: se a carne subiu ontem, os 8 kg que ja la estavam nao
 * passaram a valer mais.
 *
 * O custo medio ponderado responde a isso. Cada entrada dilui o custo do que
 * ja existia:
 *
 *     novoMedio = (qtdAntiga x medioAntigo + qtdEntrada x custoEntrada)
 *                 / (qtdAntiga + qtdEntrada)
 *
 * e cada saida e valorizada ao medio do momento. E o metodo padrao em
 * alimentacao, e o unico que faz o CMV real significar alguma coisa.
 *
 * Nao e FIFO nem LIFO. FIFO exigiria guardar lotes com validade — util numa
 * cozinha, mas e outro projeto; quando existir, e aqui que entra.
 */

import type { BaseUnit } from '@/lib/units';

export type MovementKind =
  | 'PURCHASE'
  | 'PRODUCTION'
  | 'WASTE'
  | 'PROMO'
  | 'ADJUSTMENT'
  | 'INVENTORY';

/** Movimentos que tiram do estoque. */
export const OUTFLOW_KINDS: MovementKind[] = ['PRODUCTION', 'WASTE', 'PROMO'];

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  PURCHASE: 'Compra recebida',
  PRODUCTION: 'Producao',
  WASTE: 'Quebra',
  PROMO: 'Amostra ou divulgacao',
  ADJUSTMENT: 'Ajuste manual',
  INVENTORY: 'Contagem de inventario',
};

export interface StockState {
  qtyBase: number;
  /** Custo medio por unidade base do que esta em estoque. */
  avgUnitCost: number;
}

export interface MovementInput {
  kind: MovementKind;
  /** Com sinal: positiva entra, negativa sai. */
  qtyBase: number;
  /** Obrigatorio nas entradas; nas saidas e ignorado e usa-se o medio. */
  unitCost?: number;
}

export interface AppliedMovement {
  state: StockState;
  /** Custo unitario com que este movimento ficou registado. */
  unitCost: number;
  /** `qtyBase * unitCost`, com o sinal do movimento. */
  value: number;
}

export const EMPTY_STOCK: StockState = { qtyBase: 0, avgUnitCost: 0 };

/**
 * Aplica um movimento e devolve o estado novo.
 *
 * Entradas recalculam o medio; saidas consomem ao medio corrente e nao o
 * alteram — tirar do armazem nao muda o que o resto custou.
 */
export function applyMovement(
  state: StockState,
  mv: MovementInput,
): AppliedMovement {
  const qty = mv.qtyBase;

  // Movimento nulo: nao mexe em nada, mas ainda assim fica registado com o
  // medio corrente, para o livro nao ter buracos.
  if (qty === 0) {
    return { state, unitCost: state.avgUnitCost, value: 0 };
  }

  if (qty > 0) {
    const custoEntrada = mv.unitCost ?? state.avgUnitCost;
    const qtyNova = state.qtyBase + qty;

    // Dois casos em que a media ponderada nao se aplica e o custo da entrada
    // passa a valer por todo o saldo:
    //
    //  - estoque negativo (produziu-se antes de registar a compra), onde o
    //    denominador pode ate dar zero;
    //  - saldo sem base de custo (medio zero), tipicamente um estoque inicial
    //    digitado a mao. Zero ali significa "custo desconhecido", nao "de
    //    graca" — ponderar contra ele afundaria o preco do que acabou de
    //    entrar e falsearia todo o CMV real a seguir.
    const semBaseDeCusto = state.avgUnitCost <= 0;
    const medio =
      state.qtyBase > 0 && qtyNova > 0 && !semBaseDeCusto
        ? (state.qtyBase * state.avgUnitCost + qty * custoEntrada) / qtyNova
        : custoEntrada;

    return {
      state: { qtyBase: qtyNova, avgUnitCost: medio },
      unitCost: custoEntrada,
      value: qty * custoEntrada,
    };
  }

  // Saida: valoriza ao medio corrente, que nao muda.
  const custoSaida = state.avgUnitCost;
  return {
    state: { qtyBase: state.qtyBase + qty, avgUnitCost: state.avgUnitCost },
    unitCost: custoSaida,
    value: qty * custoSaida,
  };
}

export interface PlannedMovement {
  ingredientId: string;
  kind: MovementKind;
  qtyBase: number;
  unitCost: number;
  value: number;
  note?: string;
  /** Saldo e custo medio do insumo depois deste movimento. */
  finalQtyBase: number;
  finalAvgCost: number;
}

export interface PlanEntry {
  ingredientId: string;
  kind: MovementKind;
  qtyBase: number;
  unitCost?: number;
  note?: string;
}

/**
 * Calcula todos os movimentos e os saldos finais **antes** de escrever.
 *
 * Existe por uma razao muito concreta: a versao anterior lia o estado de cada
 * insumo de dentro da transacao, um por um. Com a latencia de um Postgres
 * remoto e uma dezena de insumos, a transacao estourava o limite de tempo do
 * Prisma e nada era gravado. Calcular aqui deixa a transacao so com escritas.
 *
 * Varios movimentos do mesmo insumo encadeiam-se na ordem dada, como
 * aconteceria se fossem gravados um a um.
 */
export function planMovements(
  estadoInicial: Map<string, StockState>,
  entradas: PlanEntry[],
): PlannedMovement[] {
  const estados = new Map(estadoInicial);
  const plano: PlannedMovement[] = [];

  for (const e of entradas) {
    if (e.qtyBase === 0) continue;

    const antes = estados.get(e.ingredientId) ?? EMPTY_STOCK;
    const r = applyMovement(antes, {
      kind: e.kind,
      qtyBase: e.qtyBase,
      unitCost: e.unitCost,
    });

    estados.set(e.ingredientId, r.state);
    plano.push({
      ingredientId: e.ingredientId,
      kind: e.kind,
      qtyBase: e.qtyBase,
      unitCost: r.unitCost,
      value: r.value,
      note: e.note,
      finalQtyBase: r.state.qtyBase,
      finalAvgCost: r.state.avgUnitCost,
    });
  }

  return plano;
}

/** O saldo final de cada insumo tocado pelo plano. */
export function finalStates(plano: PlannedMovement[]): Map<string, StockState> {
  const out = new Map<string, StockState>();
  for (const m of plano) {
    out.set(m.ingredientId, {
      qtyBase: m.finalQtyBase,
      avgUnitCost: m.finalAvgCost,
    });
  }
  return out;
}

/** Reaplica uma sequencia de movimentos desde o estado vazio. */
export function replayMovements(movements: MovementInput[]): StockState {
  let state = EMPTY_STOCK;
  for (const mv of movements) {
    state = applyMovement(state, mv).state;
  }
  return state;
}

/**
 * O movimento que leva o estoque da quantidade atual para a contada.
 *
 * Devolve `null` quando a contagem confirma o saldo — nesse caso nao ha
 * ajuste a registar, e registar um movimento de zero so poluiria o livro.
 */
export function inventoryAdjustment(
  state: StockState,
  countedBase: number,
): MovementInput | null {
  const diff = countedBase - state.qtyBase;
  if (Math.abs(diff) < 1e-9) return null;
  return {
    kind: 'INVENTORY',
    qtyBase: diff,
    // Sobra encontrada entra ao medio corrente: nao se sabe outro preco.
    unitCost: state.avgUnitCost,
  };
}

// ---------------------------------------------------------------------------
// CMV teorico x CMV real
// ---------------------------------------------------------------------------

export interface VarianceInput {
  /** Custo que as fichas tecnicas dizem que o vendido devia ter consumido. */
  theoreticalCost: number;
  /** Valor que de facto saiu do armazem por producao. */
  actualProductionCost: number;
  /** Valor perdido em quebras. */
  wasteCost: number;
  /**
   * Valor do que foi oferecido: amostras, eventos, divulgacao.
   *
   * **Nao entra no CMV real.** Saiu do armazem, mas nao houve venda a que o
   * associar — somar isto ao custo do vendido faria o CMV disparar e mandava
   * procurar desperdicio onde ha marketing. E custo, mas de outra natureza.
   */
  promoCost?: number;
  /** Receita liquida do periodo, para exprimir os CMV em percentagem. */
  netRevenue: number;
}

export interface Variance {
  theoreticalCost: number;
  actualCost: number;
  wasteCost: number;
  /** Custo do que foi oferecido, fora do CMV. */
  promoCost: number;
  /** actual - theoretical. Positivo = gastou-se mais do que a ficha previa. */
  gap: number;
  /** O desvio como fracao do custo teorico. */
  gapRate: number;
  theoreticalCmv: number;
  actualCmv: number;
  /** actualCmv - theoreticalCmv, em pontos percentuais. */
  cmvGapPoints: number;
}

/**
 * Compara o que as fichas dizem com o que o armazem entregou.
 *
 * A quebra entra no custo real porque foi dinheiro que saiu: o objetivo e
 * saber quanto custou de facto produzir o que se vendeu, nao quanto deveria
 * ter custado num mundo sem desperdicio.
 */
export function computeVariance(input: VarianceInput): Variance {
  const actualCost = input.actualProductionCost + input.wasteCost;
  const gap = actualCost - input.theoreticalCost;
  const receita = input.netRevenue;

  return {
    theoreticalCost: input.theoreticalCost,
    actualCost,
    wasteCost: input.wasteCost,
    promoCost: input.promoCost ?? 0,
    gap,
    gapRate: input.theoreticalCost > 0 ? gap / input.theoreticalCost : 0,
    theoreticalCmv: receita > 0 ? input.theoreticalCost / receita : 0,
    actualCmv: receita > 0 ? actualCost / receita : 0,
    cmvGapPoints:
      receita > 0 ? (actualCost - input.theoreticalCost) / receita : 0,
  };
}

// ---------------------------------------------------------------------------
// Apresentacao
// ---------------------------------------------------------------------------

export interface StockLine {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  qtyBase: number;
  avgUnitCost: number;
  /** Quanto vale o que esta no armazem. */
  value: number;
  /** Abaixo de zero significa que se produziu sem registar a compra. */
  negative: boolean;
}

export function stockValue(lines: StockLine[]): number {
  return lines.reduce((acc, l) => acc + l.value, 0);
}
