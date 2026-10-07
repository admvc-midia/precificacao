/**
 * Leituras do livro de receitas. Nenhuma escrita aqui — essas vivem em
 * `lib/actions/livro.ts`.
 */

import { prisma } from '@/lib/db';
import { casaComBusca, type SourceKind } from './receita';

/** A versao em uso de cada receita, com o resto que a lista mostra. */
export async function listarReceitas(filtro: {
  busca?: string;
  etiqueta?: string;
  origem?: SourceKind;
  arquivadas?: boolean;
}) {
  const receitas = await prisma.bookRecipe.findMany({
    where: {
      archivedAt: filtro.arquivadas ? { not: null } : null,
      ...(filtro.etiqueta ? { tags: { has: filtro.etiqueta } } : {}),
      ...(filtro.origem ? { sourceKind: filtro.origem } : {}),
    },
    include: {
      versions: {
        select: { number: true, ingredients: true, steps: true, createdAt: true, authorName: true },
        orderBy: { number: 'desc' },
      },
      entries: { select: { cookbook: { select: { id: true, title: true } } } },
    },
    orderBy: { title: 'asc' },
  });

  // A busca e em memoria: um livro de receitas tem dezenas ou centenas, e
  // assim "pao" encontra "Pão" sem precisar de extensoes no Postgres.
  return receitas
    .map((r) => ({
      ...r,
      atual: r.versions.find((v) => v.number === r.currentVersion) ?? r.versions[0],
      totalVersoes: r.versions.length,
    }))
    .filter((r) =>
      casaComBusca(filtro.busca ?? '', [
        r.title,
        r.sourceName,
        r.tags.join(' '),
        r.atual?.ingredients,
      ]),
    );
}

export async function todasAsEtiquetas(): Promise<string[]> {
  const rows = await prisma.bookRecipe.findMany({
    where: { archivedAt: null },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'pt'));
}

export async function detalheReceita(id: string) {
  return prisma.bookRecipe.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { number: 'desc' } },
      entries: { include: { cookbook: { select: { id: true, title: true } } } },
      ficha: { select: { id: true, name: true, updatedAt: true } },
    },
  });
}

export async function listarLivros() {
  return prisma.cookbook.findMany({
    include: { _count: { select: { entries: true } } },
    orderBy: { title: 'asc' },
  });
}

/** O livro, com as receitas (na versao em uso) pela ordem do livro. */
export async function detalheLivro(id: string) {
  const livro = await prisma.cookbook.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          recipe: {
            include: { versions: { orderBy: { number: 'asc' } } },
          },
        },
      },
    },
  });
  if (!livro) return null;
  return {
    ...livro,
    entries: livro.entries
      .filter((e) => !e.recipe.archivedAt)
      .map((e) => ({
        ...e,
        atual:
          e.recipe.versions.find((v) => v.number === e.recipe.currentVersion) ??
          e.recipe.versions[e.recipe.versions.length - 1],
        original: e.recipe.versions[0],
      })),
  };
}

/** As receitas que ainda nao estao no livro, para o "juntar". */
export async function receitasForaDoLivro(cookbookId: string) {
  return prisma.bookRecipe.findMany({
    where: { archivedAt: null, entries: { none: { cookbookId } } },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });
}

/**
 * Seccoes por ordem de aparecimento, com as receitas de cada uma — para o
 * indice e a impressao. As sem seccao vao para "Outras", no fim.
 */
export function porSeccao<T extends { section: string | null }>(entradas: T[]): Array<{ seccao: string | null; itens: T[] }> {
  const ordem: Array<string | null> = [];
  const mapa = new Map<string | null, T[]>();
  for (const e of entradas) {
    const s = e.section?.trim() || null;
    if (!mapa.has(s)) {
      mapa.set(s, []);
      if (s !== null) ordem.push(s);
    }
    mapa.get(s)!.push(e);
  }
  if (mapa.has(null)) ordem.push(null);
  return ordem.map((s) => ({ seccao: s, itens: mapa.get(s)! }));
}
