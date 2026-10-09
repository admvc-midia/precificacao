/**
 * Gravar e ler os contadores do cardapio (`MenuStat`). As contas puras (de
 * onde veio, robos, o resumo) estao em `./estatisticas.ts`.
 */

import { diaEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import { resumir, segundaDe, type Evento, type Origem, type Resumo } from './estatisticas';

/** Soma um ao contador do dia. Nunca lanca: uma estatistica nao parte a pagina. */
export async function contar(evento: Evento, origem: Origem, agora = new Date()): Promise<void> {
  const day = new Date(`${diaEmLisboa(agora)}T00:00:00Z`);
  try {
    await prisma.menuStat.upsert({
      where: { day_event_source: { day, event: evento, source: origem } },
      create: { day, event: evento, source: origem, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn('[cardapio] nao consegui contar', evento, origem, err);
  }
}

/** Le os ultimos ~9 semanas da base e resume. */
export async function resumoDoCardapio(agora = new Date()): Promise<Resumo> {
  const hoje = diaEmLisboa(agora);
  const desde = new Date(`${segundaDe(hoje)}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 7 * 8);
  let linhas: Awaited<ReturnType<typeof prisma.menuStat.findMany>>;
  try {
    linhas = await prisma.menuStat.findMany({ where: { day: { gte: desde } } });
  } catch (err) {
    // Codigo publicado antes do `db push` da tabela: numeros a zero em vez de
    // partir o ecra do Cardapio e as Campanhas.
    if ((err as { code?: string }).code !== 'P2021') throw err;
    linhas = [];
  }
  return resumir(
    linhas.map((l) => ({ day: l.day.toISOString().slice(0, 10), event: l.event, source: l.source, count: l.count })),
    hoje,
  );
}

// ---------------------------------------------------------------------------
// Por produto
// ---------------------------------------------------------------------------

/** Soma um ao contador do produto no dia. Nunca lanca. */
export async function contarItem(evento: 'OPEN' | 'ADD', menuItemId: string, agora = new Date()): Promise<void> {
  const day = new Date(`${diaEmLisboa(agora)}T00:00:00Z`);
  try {
    await prisma.menuItemStat.upsert({
      where: { day_menuItemId_event: { day, menuItemId, event: evento } },
      create: { day, menuItemId, event: evento, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn('[cardapio] nao consegui contar o produto', evento, menuItemId, err);
  }
}

export interface ProdutoVisto {
  id: string;
  nome: string;
  abertos: number;
  juntados: number;
}

/** Os produtos mais abertos nos ultimos 30 dias (com quantas vezes foram juntados). */
export async function produtosMaisVistos(limite = 8, agora = new Date()): Promise<ProdutoVisto[]> {
  const desde = new Date(`${diaEmLisboa(agora)}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 29);
  let linhas: Array<{ menuItemId: string; event: 'OPEN' | 'ADD'; count: number }>;
  try {
    linhas = await prisma.menuItemStat.findMany({ where: { day: { gte: desde } }, select: { menuItemId: true, event: true, count: true } });
  } catch (err) {
    // Tabela ainda por criar (antes do db push): sem numeros, sem partir.
    if ((err as { code?: string }).code !== 'P2021') throw err;
    return [];
  }
  const porItem = new Map<string, { abertos: number; juntados: number }>();
  for (const l of linhas) {
    const v = porItem.get(l.menuItemId) ?? { abertos: 0, juntados: 0 };
    if (l.event === 'OPEN') v.abertos += l.count;
    else v.juntados += l.count;
    porItem.set(l.menuItemId, v);
  }
  const itens = await prisma.menuItem.findMany({
    where: { id: { in: [...porItem.keys()] } },
    select: { id: true, name: true, recipe: { select: { name: true } } },
  });
  return itens
    .map((i) => ({ id: i.id, nome: i.name || i.recipe?.name || 'Sem nome', ...porItem.get(i.id)! }))
    .sort((a, b) => b.abertos - a.abertos || b.juntados - a.juntados)
    .slice(0, limite);
}
