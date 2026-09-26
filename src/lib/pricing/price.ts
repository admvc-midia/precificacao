/**
 * Motor de precificacao (Modulo 3).
 *
 * ---------------------------------------------------------------------------
 * PREMISSAS (as mesmas em toda a aplicacao)
 * ---------------------------------------------------------------------------
 *
 * 1. IVA. `vatMode` diz se o preco de menu ja inclui o imposto (INCLUDED,
 *    o normal numa lanchonete em Portugal/Brasil) ou se ele e acrescido
 *    na conta (ADDED, tipico de B2B).
 *
 * 2. Base de incidencia. Nao ha uma unica base "certa" — ha a base que
 *    corresponde a como o dinheiro realmente sai:
 *      - custos fixos (f) e lucro alvo (m) incidem sobre a RECEITA LIQUIDA
 *        (sem IVA), que e o que a casa de facto fatura;
 *      - taxa de cartao (c) e comissao de plataforma (k) incidem sobre o
 *        VALOR BRUTO pago pelo cliente, porque e sobre esse valor que a
 *        Uber Eats e a rede de cartoes cobram.
 *
 * 3. Custos em moeda. O custo primo (C) e o frete proprio (D) sao valores
 *    absolutos, nao percentuais.
 *
 * Com P = preco de menu, a equacao de equilibrio e:
 *
 *      receita_liquida * (1 - f - m)  -  bruto * (c + k)  =  C + D
 *
 * Resolvendo para P:
 *
 *      INCLUDED:  P * [ (1 - f - m) / (1 + iva)  -  (c + k) ]        = C + D
 *      ADDED:     P * [ (1 - f - m)  -  (1 + iva) * (c + k) ]        = C + D
 *
 * O termo entre colchetes e o "denominador". Se ele for <= 0, as taxas
 * somadas consomem 100% da receita e NAO EXISTE preco viavel — a aplicacao
 * avisa em vez de devolver um numero absurdo ou negativo.
 */

import type {
  BreakdownCosts,
  PriceBreakdown,
  PriceResult,
  PricingParams,
  RoundingStrategy,
} from './types';

export type { BreakdownCosts };

/**
 * O fator que multiplica o preco na equacao de equilibrio.
 * Exportado porque e a peca reutilizada por todos os modos de calculo.
 *
 * @param targetMargin lucro alvo como fracao da receita liquida (0 = so cobre custos)
 */
export function priceDenominator(params: PricingParams, targetMargin: number): number {
  const { vatRate, vatMode, fixedCostRate, cardFeeRate, platformFeeRate } = params;
  const variableOnGross = cardFeeRate + platformFeeRate;
  const onNet = 1 - fixedCostRate - targetMargin;

  return vatMode === 'INCLUDED'
    ? onNet / (1 + vatRate) - variableOnGross
    : onNet - (1 + vatRate) * variableOnGross;
}

/**
 * Resolve o preco de menu que cobre `costTotal` e ainda deixa `targetMargin`
 * de lucro sobre a receita liquida.
 *
 * @returns `null` quando nao existe preco viavel.
 */
export function solvePrice(
  costTotal: number,
  params: PricingParams,
  targetMargin: number,
): number | null {
  const denom = priceDenominator(params, targetMargin);
  if (denom <= 0) return null;
  return costTotal / denom;
}

// ---------------------------------------------------------------------------
// Autopsia de um preco
// ---------------------------------------------------------------------------

/**
 * Para onde vai cada centimo de um preco. Funciona para qualquer preco —
 * sugerido pelo motor ou praticado hoje pela casa.
 */
export function breakdown(
  price: number,
  costs: BreakdownCosts,
  params: PricingParams,
): PriceBreakdown {
  const { vatRate, vatMode, fixedCostRate, cardFeeRate, platformFeeRate } = params;

  const gross = vatMode === 'INCLUDED' ? price : price * (1 + vatRate);
  const net = vatMode === 'INCLUDED' ? price / (1 + vatRate) : price;
  const vatAmount = gross - net;

  const primeCost = costs.foodCost + costs.packagingCost;
  const fixedCost = net * fixedCostRate;
  const cardFee = gross * cardFeeRate;
  const platformFee = gross * platformFeeRate;

  const profit =
    net - fixedCost - cardFee - platformFee - primeCost - params.deliveryCost;

  return {
    price,
    gross,
    net,
    vatAmount,
    foodCost: costs.foodCost,
    packagingCost: costs.packagingCost,
    primeCost,
    deliveryCost: params.deliveryCost,
    fixedCost,
    cardFee,
    platformFee,
    profit,
    cmv: net > 0 ? primeCost / net : 0,
    netMargin: net > 0 ? profit / net : 0,
    markup: primeCost > 0 ? price / primeCost : 0,
    contributionMargin:
      net - primeCost - cardFee - platformFee - params.deliveryCost,
  };
}

// ---------------------------------------------------------------------------
// Os tres modos de calculo
// ---------------------------------------------------------------------------

export interface PriceOptions {
  rounding?: RoundingStrategy;
}

/**
 * Modo 1 — CMV alvo. "Quero que o custo do produto seja 30% do que eu
 * fatura liquido." O preco sai direto de `net = C / cmv`; o lucro que
 * sobra e consequencia, e pode ser negativo se as taxas forem altas.
 */
export function priceFromTargetCmv(
  costs: BreakdownCosts,
  params: PricingParams,
  targetCmv: number,
  opts: PriceOptions = {},
): PriceResult {
  const warnings: string[] = [];
  const primeCost = costs.foodCost + costs.packagingCost;

  if (targetCmv <= 0 || targetCmv >= 1) {
    return infeasible(costs, params, [
      'O CMV alvo tem de estar entre 0% e 100% (exclusive).',
    ]);
  }

  const net = primeCost / targetCmv;
  const rawPrice = params.vatMode === 'INCLUDED' ? net * (1 + params.vatRate) : net;
  const price = applyRounding(rawPrice, opts.rounding ?? 'NONE');

  const result = breakdown(price, costs, params);

  if (result.profit < 0) {
    warnings.push(
      `Com CMV de ${pct(targetCmv)} este produto da prejuizo: as taxas e os custos fixos consomem mais do que sobra. Baixe o CMV alvo ou reduza o custo primo.`,
    );
  }
  if (params.deliveryCost > 0 && result.profit < params.deliveryCost) {
    warnings.push(
      'O modo CMV alvo nao considera o frete no calculo do preco — verifique a margem resultante neste canal.',
    );
  }

  return { ...result, rawPrice, feasible: true, warnings };
}

/**
 * Modo 2 — Margem alvo. "Quero 15% de lucro liquido, custe o que custar
 * o preco." E o modo matematicamente correto: resolve a equacao de
 * equilibrio e pode declarar o alvo impossivel.
 */
export function priceFromTargetMargin(
  costs: BreakdownCosts,
  params: PricingParams,
  targetMargin: number,
  opts: PriceOptions = {},
): PriceResult {
  const warnings: string[] = [];
  const primeCost = costs.foodCost + costs.packagingCost;
  const denom = priceDenominator(params, targetMargin);

  if (denom <= 0) {
    return infeasible(costs, params, [
      `Alvo impossivel: impostos, custos fixos, cartao, comissao e o lucro pedido somam ${pct(
        1 - denom,
      )} da receita. Reduza o lucro alvo ou as taxas.`,
    ]);
  }

  const rawPrice = (primeCost + params.deliveryCost) / denom;
  const price = applyRounding(rawPrice, opts.rounding ?? 'NONE');
  const result = breakdown(price, costs, params);

  if (result.cmv > 0.4) {
    warnings.push(
      `CMV de ${pct(result.cmv)} — acima dos 40% que costumam ser o limite saudavel em lanchonete.`,
    );
  }

  return { ...result, rawPrice, feasible: true, warnings };
}

/**
 * Modo 3 — Preco manual. O usuario ja pratica um preco; a aplicacao so
 * diz a verdade sobre ele.
 */
export function analyzeManualPrice(
  price: number,
  costs: BreakdownCosts,
  params: PricingParams,
): PriceResult {
  const warnings: string[] = [];
  const result = breakdown(price, costs, params);

  if (result.profit < 0) {
    warnings.push(
      `Este preco da prejuizo de ${result.profit.toFixed(2)} por unidade vendida.`,
    );
  } else if (result.netMargin < 0.05) {
    warnings.push(
      `Margem liquida de apenas ${pct(result.netMargin)} — qualquer variacao de custo vira prejuizo.`,
    );
  }
  if (result.cmv > 0.4) {
    warnings.push(`CMV de ${pct(result.cmv)}, acima do limite saudavel de 40%.`);
  }

  return { ...result, rawPrice: price, feasible: true, warnings };
}

function infeasible(
  costs: BreakdownCosts,
  params: PricingParams,
  warnings: string[],
): PriceResult {
  const zero = breakdown(0, costs, params);
  return { ...zero, rawPrice: 0, feasible: false, warnings };
}

// ---------------------------------------------------------------------------
// Arredondamento psicologico
// ---------------------------------------------------------------------------

/**
 * Arredonda **sempre para cima** dentro da estrategia escolhida. Arredondar
 * para baixo comeria a margem que o motor acabou de calcular.
 */
export function applyRounding(price: number, strategy: RoundingStrategy): number {
  if (!Number.isFinite(price) || price <= 0) return round2(price);

  switch (strategy) {
    case 'NEAREST_05':
      return round2(Math.ceil(price * 20) / 20);
    case 'NEAREST_10':
      return round2(Math.ceil(price * 10) / 10);
    case 'ENDING_90':
      return endingAt(price, 0.9);
    case 'ENDING_95':
      return endingAt(price, 0.95);
    case 'NONE':
    default:
      return round2(price);
  }
}

function endingAt(price: number, cents: number): number {
  const floorUnit = Math.floor(price);
  const candidate = floorUnit + cents;
  return round2(candidate >= price ? candidate : floorUnit + 1 + cents);
}

export function round2(value: number): number {
  // Number.EPSILON evita que 1.005 caia para 1.00 por erro de ponto flutuante.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
