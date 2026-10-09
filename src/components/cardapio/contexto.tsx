'use client';

/**
 * O que todas as pecas do cardapio publico partilham: os dados, o pedido em
 * curso (quantidades), abrir a folha de um produto ou uma foto em grande, e
 * contar eventos (sem dados da pessoa — ver `lib/cardapio/estatisticas.ts`).
 */

import { createContext, use } from 'react';

import type { CardapioPublico, ItemPublico } from '@/lib/cardapio/consultas';
import { formatMoney, type CurrencyConfig } from '@/lib/money';

export interface ContextoCardapio {
  dados: CardapioPublico;
  hoje: string;
  cfg: CurrencyConfig;
  origem: string;
  qtd: Record<string, number>;
  /** Soma `d` a quantidade (0 a 999). So existe se ha WhatsApp para encomendar. */
  mudar: ((id: string, d: number) => void) | null;
  item: (id: string) => ItemPublico | undefined;
  abrirProduto: (id: string) => void;
  abrirFoto: (f: { src: string; alt: string }) => void;
}

export const Contexto = createContext<ContextoCardapio | null>(null);

export function useCardapio(): ContextoCardapio {
  const c = use(Contexto);
  if (!c) throw new Error('Fora do cardapio.');
  return c;
}

/** "25,00 €" → "25 €" quando nao ha centimos. */
export function preco(v: number, cfg: CurrencyConfig): string {
  const s = formatMoney(v, cfg);
  return Number.isInteger(Math.round(v * 100) / 100) ? s.replace(/[,.]00(?=\D|$)/, '') : s;
}

/**
 * Conta um evento do cardapio. `sendBeacon` sobrevive a ida para o WhatsApp;
 * uma estatistica nunca impede de encomendar.
 */
export function contarEvento(e: 'ORDER' | 'QUOTE' | 'OPEN' | 'ADD', origem: string, itemId?: string) {
  try {
    navigator.sendBeacon?.('/api/cardapio/evento', JSON.stringify({ e, o: origem, ...(itemId ? { i: itemId } : {}) }));
  } catch {
    // nada
  }
}

/** Um toque curto no telemovel ao juntar (onde o browser deixa). */
export function vibrar() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // nada
  }
}

export const DESTAQUE_LABEL = { BESTSELLER: 'Mais pedido', NEW: 'Novidade' } as const;
