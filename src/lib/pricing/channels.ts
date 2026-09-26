/**
 * Simulador multi-canal (Modulo 3).
 *
 * O mesmo produto tem custos diferentes em cada canal: a plataforma cobra
 * comissao, a entrega propria paga estafeta, o balcao nao usa embalagem de
 * transporte. Este modulo monta os parametros corretos por canal e responde
 * a pergunta que interessa ao dono da casa:
 *
 *   "Por quanto tenho de vender na Uber Eats para ganhar o MESMO EURO que
 *    ganho no balcao?"
 */

import {
  analyzeManualPrice,
  applyRounding,
  breakdown,
  priceFromTargetCmv,
  priceFromTargetMargin,
  solvePrice,
} from './price';
import type {
  BreakdownCosts,
  PriceResult,
  PricingMode,
  PricingParams,
  RecipeCost,
  RoundingStrategy,
  ChannelInput,
} from './types';

export interface GlobalSettings {
  vatRate: number;
  vatMode: PricingParams['vatMode'];
  fixedCostRate: number;
  cardFeeRate: number;
  targetCmv: number;
  targetMargin: number;
  rounding: RoundingStrategy;
}

/** Parametros e custos efetivos de um produto num canal especifico. */
export function channelContext(
  cost: RecipeCost,
  channel: ChannelInput,
  settings: GlobalSettings,
): { params: PricingParams; costs: BreakdownCosts } {
  const params: PricingParams = {
    vatRate: settings.vatRate,
    vatMode: settings.vatMode,
    fixedCostRate: settings.fixedCostRate,
    // Plataformas normalmente ja embutem o pagamento na comissao: o canal
    // pode zerar a taxa de cartao sem mexer na configuracao global.
    cardFeeRate: channel.cardFeeRate ?? settings.cardFeeRate,
    platformFeeRate: channel.commissionRate,
    deliveryCost: channel.deliveryCost,
  };

  const costs: BreakdownCosts = {
    foodCost: cost.foodCostPerUnit,
    packagingCost:
      cost.packagingCost +
      (channel.usesDeliveryPackaging ? cost.deliveryPackagingCost : 0),
  };

  return { params, costs };
}

export interface ChannelResult {
  channel: ChannelInput;
  params: PricingParams;
  costs: BreakdownCosts;
  /** Preco calculado pelo modo escolhido do produto. */
  suggested: PriceResult;
  /**
   * Preco que replica, neste canal, o mesmo LUCRO EM MOEDA do canal de
   * referencia. `null` quando nao ha preco viavel.
   */
  profitMatchedPrice: number | null;
  /** Autopsia do `profitMatchedPrice`, quando existe. */
  profitMatched: PriceResult | null;
}

export interface SimulationInput {
  cost: RecipeCost;
  settings: GlobalSettings;
  channels: ChannelInput[];
  mode: PricingMode;
  /** Usado quando `mode` = MANUAL. Preco no canal de referencia. */
  manualPrice?: number | null;
  /** Sobrescreve settings.targetCmv. */
  targetCmv?: number | null;
  /** Sobrescreve settings.targetMargin. */
  targetMargin?: number | null;
}

export interface SimulationResult {
  /** Canal usado como referencia de lucro (o primeiro COUNTER, ou o primeiro). */
  reference: ChannelResult;
  results: ChannelResult[];
}

/**
 * Calcula o produto em todos os canais.
 *
 * O canal de referencia e o balcao: o lucro que ele gera e a meta que os
 * outros canais tem de replicar em euros, nao em percentagem. Replicar a
 * percentagem seria um erro — 15% de um preco inflado pela comissao nao e
 * o mesmo dinheiro no bolso.
 */
export function simulateChannels(input: SimulationInput): SimulationResult {
  const { cost, settings, channels, mode } = input;

  if (channels.length === 0) {
    throw new Error('Nenhum canal de venda configurado.');
  }

  const reference = channels.find((c) => c.kind === 'COUNTER') ?? channels[0];
  const refResult = priceInChannel(cost, reference, settings, input);
  const targetProfit = refResult.suggested.feasible ? refResult.suggested.profit : 0;

  const results = channels.map((channel) => {
    const base =
      channel.id === reference.id
        ? refResult
        : priceInChannel(cost, channel, settings, input);

    const { params, costs } = base;
    const primeCost = costs.foodCost + costs.packagingCost;

    // Mesmo lucro em moeda: trata o lucro alvo como mais um custo a cobrir.
    const raw = solvePrice(primeCost + params.deliveryCost + targetProfit, params, 0);
    const matchedPrice = raw === null ? null : applyRounding(raw, settings.rounding);

    return {
      ...base,
      profitMatchedPrice: matchedPrice,
      profitMatched:
        matchedPrice === null ? null : analyzeManualPrice(matchedPrice, costs, params),
    };
  });

  return {
    reference: results.find((r) => r.channel.id === reference.id) ?? results[0],
    results,
  };
}

function priceInChannel(
  cost: RecipeCost,
  channel: ChannelInput,
  settings: GlobalSettings,
  input: SimulationInput,
): Omit<ChannelResult, 'profitMatchedPrice' | 'profitMatched'> {
  const { params, costs } = channelContext(cost, channel, settings);
  const opts = { rounding: settings.rounding };

  let suggested: PriceResult;
  switch (input.mode) {
    case 'TARGET_CMV':
      suggested = priceFromTargetCmv(
        costs,
        params,
        input.targetCmv ?? settings.targetCmv,
        opts,
      );
      break;
    case 'TARGET_MARGIN':
      suggested = priceFromTargetMargin(
        costs,
        params,
        input.targetMargin ?? settings.targetMargin,
        opts,
      );
      break;
    case 'MANUAL':
    default:
      suggested = analyzeManualPrice(input.manualPrice ?? 0, costs, params);
      break;
  }

  return { channel, params, costs, suggested };
}

// ---------------------------------------------------------------------------
// Engenharia de cardapio (Modulo 5)
// ---------------------------------------------------------------------------

export type MenuClass = 'ESTRELA' | 'CAVALO' | 'QUEBRA_CABECA' | 'ABACAXI';

export const MENU_CLASS_LABEL: Record<MenuClass, string> = {
  ESTRELA: 'Estrela',
  CAVALO: 'Cavalo de batalha',
  QUEBRA_CABECA: 'Quebra-cabeca',
  ABACAXI: 'Abacaxi',
};

/**
 * Matriz classica de engenharia de cardapio (Kasavana & Smith), adaptada:
 * cruza popularidade com margem de contribuicao.
 *
 * - Estrela: vende muito e da margem. Proteger, nunca baixar preco.
 * - Cavalo de batalha: vende muito, margem fraca. Atacar o custo primo.
 * - Quebra-cabeca: margem boa, vende pouco. Reposicionar no menu.
 * - Abacaxi: nao vende e nao da margem. Candidato a sair.
 */
export function classifyMenuItem(
  contributionMargin: number,
  avgContributionMargin: number,
  popularity: number,
  avgPopularity: number,
): MenuClass {
  const highMargin = contributionMargin >= avgContributionMargin;
  const highPopularity = popularity >= avgPopularity;

  if (highMargin && highPopularity) return 'ESTRELA';
  if (!highMargin && highPopularity) return 'CAVALO';
  if (highMargin && !highPopularity) return 'QUEBRA_CABECA';
  return 'ABACAXI';
}

/**
 * Quanto o preco pode cair antes do produto deixar de dar lucro — a
 * pergunta que aparece toda vez que se pensa numa promocao.
 */
export function breakEvenPrice(
  costs: BreakdownCosts,
  params: PricingParams,
): number | null {
  const primeCost = costs.foodCost + costs.packagingCost;
  const raw = solvePrice(primeCost + params.deliveryCost, params, 0);
  return raw === null ? null : Math.ceil(raw * 100) / 100;
}

/** Percentagens do preco bruto, para o grafico de DRE do produto. */
export function breakdownShares(result: ReturnType<typeof breakdown>) {
  const total = result.gross || 1;
  return {
    food: result.foodCost / total,
    packaging: result.packagingCost / total,
    delivery: result.deliveryCost / total,
    vat: result.vatAmount / total,
    fees: (result.cardFee + result.platformFee) / total,
    fixed: result.fixedCost / total,
    profit: result.profit / total,
  };
}
