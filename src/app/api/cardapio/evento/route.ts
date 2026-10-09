/**
 * Os cliques do cardapio publico ("Encomendar", "Pedir orcamento"), mandados
 * pelo browser com `navigator.sendBeacon`. Aberta sem sessao, como o
 * cardapio (`abertaSemSessao`).
 *
 * So aceita os eventos de clique e as origens conhecidas; tudo o resto e
 * ignorado em silencio (204). Nada da pessoa e guardado — ver
 * `lib/cardapio/estatisticas.ts`.
 */

import { NextResponse } from 'next/server';

import { eRobo, ORIGENS, type Origem } from '@/lib/cardapio/estatisticas';
import { contar } from '@/lib/cardapio/estatisticas-base';

export const dynamic = 'force-dynamic';

const CLIQUES = new Set(['ORDER', 'QUOTE']);

export async function POST(req: Request) {
  const nada = new NextResponse(null, { status: 204 });
  if (eRobo(req.headers.get('user-agent'))) return nada;
  let corpo: unknown;
  try {
    // Pequeno de proposito: um clique sao duas palavras.
    const texto = await req.text();
    if (texto.length > 200) return nada;
    corpo = JSON.parse(texto);
  } catch {
    return nada;
  }
  const { e, o } = (corpo ?? {}) as { e?: unknown; o?: unknown };
  if (typeof e !== 'string' || !CLIQUES.has(e)) return nada;
  const origem: Origem = typeof o === 'string' && (ORIGENS as readonly string[]).includes(o) ? (o as Origem) : 'outro';
  await contar(e as 'ORDER' | 'QUOTE', origem);
  return nada;
}
