/**
 * Os cliques do cardapio publico ("Encomendar", "Pedir orcamento"), mandados
 * pelo browser com `navigator.sendBeacon`. Aberta sem sessao, como o
 * cardapio (`abertaSemSessao`).
 *
 * Tambem os eventos de produto (OPEN: abriu a folha; ADD: juntou), com o id do
 * item. So aceita os eventos e as origens conhecidas; tudo o resto e
 * ignorado em silencio (204). Nada da pessoa e guardado — ver
 * `lib/cardapio/estatisticas.ts`.
 */

import { NextResponse } from 'next/server';

import { eRobo, ORIGENS, type Origem } from '@/lib/cardapio/estatisticas';
import { contar, contarItem } from '@/lib/cardapio/estatisticas-base';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CLIQUES = new Set(['ORDER', 'QUOTE']);
/** Eventos de um produto: abriu a folha, juntou ao pedido. Levam `i` (o id do item). */
const DO_PRODUTO = new Set(['OPEN', 'ADD']);

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
  const { e, o, i } = (corpo ?? {}) as { e?: unknown; o?: unknown; i?: unknown };
  if (typeof e !== 'string') return nada;

  if (DO_PRODUTO.has(e)) {
    // So ids de itens que existem: um id inventado nao cria linhas.
    if (typeof i !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(i)) return nada;
    if (!(await prisma.menuItem.count({ where: { id: i } }))) return nada;
    await contarItem(e as 'OPEN' | 'ADD', i);
    return nada;
  }

  if (!CLIQUES.has(e)) return nada;
  const origem: Origem = typeof o === 'string' && (ORIGENS as readonly string[]).includes(o) ? (o as Origem) : 'outro';
  await contar(e as 'ORDER' | 'QUOTE', origem);
  return nada;
}
