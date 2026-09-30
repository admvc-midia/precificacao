/**
 * O preco de um produto num canal, pelo modo que a ficha escolheu.
 *
 * Vivia dentro da pagina de Precificacao; saiu para aqui quando a exportacao
 * passou a precisar da mesma conta. Duas copias acabariam por dar precos
 * diferentes no ecra e na folha de calculo.
 */

import { channelContext, type GlobalSettings } from './channels';
import { analyzeManualPrice, priceFromTargetCmv, priceFromTargetMargin } from './price';
import type { ChannelInput, PriceResult, RecipeCost } from './types';

export interface PricedRecipeInput {
  cost: RecipeCost | null;
  pricingMode: 'TARGET_CMV' | 'TARGET_MARGIN' | 'MANUAL';
  manualPrice: number | null;
  targetCmv: number | null;
  targetMargin: number | null;
}

/** `null` quando nao ha custo (ficha com erro) ou canal para calcular. */
export function priceForRecipe(
  r: PricedRecipeInput,
  channel: ChannelInput | undefined,
  settings: GlobalSettings,
): PriceResult | null {
  if (!r.cost || !channel) return null;
  const { params, costs } = channelContext(r.cost, channel, settings);
  const opts = { rounding: settings.rounding };

  if (r.pricingMode === 'MANUAL') {
    return analyzeManualPrice(r.manualPrice ?? 0, costs, params);
  }
  if (r.pricingMode === 'TARGET_MARGIN') {
    return priceFromTargetMargin(costs, params, r.targetMargin ?? settings.targetMargin, opts);
  }
  return priceFromTargetCmv(costs, params, r.targetCmv ?? settings.targetCmv, opts);
}

/** O canal de referencia das listas: o balcao, ou o primeiro que houver. */
export function referenceChannel(channels: ChannelInput[]): ChannelInput | undefined {
  return channels.find((c) => c.kind === 'COUNTER') ?? channels[0];
}
