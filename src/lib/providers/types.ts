/**
 * Consulta de precos de supermercados (Modulo 1).
 *
 * ---------------------------------------------------------------------------
 * PORQUE ISTO E UM ADAPTER E NAO UM SCRAPER
 * ---------------------------------------------------------------------------
 * Continente, Pingo Doce e Auchan nao publicam API aberta de precos, e os
 * seus sites mudam de estrutura sem aviso, estao atras de protecao anti-bot e
 * tem termos de uso que restringem a recolha automatica. Um scraper embutido
 * aqui pararia de funcionar sozinho e levaria a precificacao errada junto.
 *
 * A aplicacao resolve isso invertendo a dependencia: ela define o CONTRATO
 * (`PriceProvider`) e sabe comparar e aplicar cotacoes. De onde a cotacao vem
 * e uma decisao de configuracao:
 *
 *   - `manualProvider`  — o utilizador anota o preco que viu na loja;
 *   - `csvProvider`     — importa uma exportacao/lista em CSV;
 *   - um adapter proprio — ligue aqui a API do seu distribuidor, um
 *                          agregador licenciado, ou o seu proprio recolhedor.
 *
 * Uma cotacao NUNCA sobrescreve o preco do insumo automaticamente. Ela vira
 * um `PriceQuote` no historico, a aplicacao mostra a diferenca, e o utilizador
 * decide aplicar. Precificacao nao deve mudar por baixo dos pes de ninguem.
 */

import type { PurchaseUnit } from '@/lib/units';

export type QuoteSource =
  | 'MANUAL'
  | 'CSV'
  | 'CONTINENTE'
  | 'PINGO_DOCE'
  | 'AUCHAN'
  | 'OTHER';

export const SOURCE_LABEL: Record<QuoteSource, string> = {
  MANUAL: 'Anotado a mao',
  CSV: 'Importado de CSV',
  CONTINENTE: 'Continente',
  PINGO_DOCE: 'Pingo Doce',
  AUCHAN: 'Auchan',
  OTHER: 'Outra fonte',
};

export interface PriceQuoteResult {
  source: QuoteSource;
  /** Nome do produto tal como aparece na fonte. */
  label: string;
  /** Preco da embalagem inteira. */
  price: number;
  /** Tamanho da embalagem. */
  qty: number;
  unit: PurchaseUnit;
  url?: string;
  capturedAt: Date;
}

export interface PriceProvider {
  readonly source: QuoteSource;
  readonly name: string;
  /** Um provider sem credenciais/dados configurados devolve false. */
  isConfigured(): boolean;
  /** Procura cotacoes para um termo. Devolve [] se nao encontrar. */
  search(term: string): Promise<PriceQuoteResult[]>;
}

/**
 * Compara uma cotacao com o preco atual do insumo, normalizando pela
 * unidade base — comparar "5 kg por 12,50" com "1 kg por 2,80" so faz
 * sentido por grama.
 */
export interface QuoteComparison {
  quote: PriceQuoteResult;
  /** Custo por unidade base da cotacao. */
  quoteUnitCost: number;
  /** Custo por unidade base do insumo hoje. */
  currentUnitCost: number;
  /** Variacao relativa. 0.1 = a cotacao esta 10% mais cara. */
  delta: number;
  cheaper: boolean;
}
