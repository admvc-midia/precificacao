/**
 * O ficheiro de onde uma receita foi importada, guardado no Blob privado.
 *
 * Fica para se poder voltar a fonte: "o que dizia mesmo o PDF do curso?".
 * Como as fotos, so se le atraves da app (`/api/receitas/<id>/original`),
 * com sessao.
 *
 * Fora de `lib/actions/` de proposito: grava e apaga sem validar quem pede.
 */

import { del, get, list, put } from '@vercel/blob';

import { blobConfigurado } from '@/lib/fotos';

/** O tecto das actions e 4 MB; o resto do formulario precisa de folga. */
export const MAX_ORIGINAL = 3_800_000;

/** Prefixo dos originais: o caminho que vem do formulario tem de comecar por aqui. */
export const PREFIXO_ORIGINAIS = 'livro/originais/';

/** Pelos primeiros bytes, e nao pelo nome: um .exe renomeado nao entra. */
export function ePdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

/** "Bolo da Avó (1).pdf" → "bolo-da-avo-1.pdf": um nome que nao parte caminhos. */
export function nomeSeguro(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'receita'}.pdf`;
}

/** Grava o PDF. Sem Blob configurado, nao guarda (a importacao continua). */
export async function gravarOriginal(bytes: Uint8Array, nome: string): Promise<string | null> {
  if (!blobConfigurado()) return null;
  const r = await put(`${PREFIXO_ORIGINAIS}${nomeSeguro(nome)}`, Buffer.from(bytes), {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/pdf',
  });
  return r.pathname;
}

/** Nunca rebenta: um ficheiro esquecido ocupa espaco, uma receita por apagar e pior. */
export async function apagarOriginal(caminho: string | null | undefined): Promise<void> {
  if (!caminho || !blobConfigurado()) return;
  try {
    await del(caminho);
  } catch (err) {
    console.warn('[livro] nao consegui apagar', caminho, err);
  }
}

export async function lerOriginal(caminho: string) {
  const r = await get(caminho, { access: 'private' });
  return r && r.statusCode === 200 ? r : null;
}

// ---------------------------------------------------------------------------
// Originais esquecidos
// ---------------------------------------------------------------------------

/** Folga antes de um PDF sem receita contar como esquecido. */
export const FOLGA_ORFAOS_MS = 24 * 60 * 60 * 1000;

/**
 * Os PDFs que ninguem vai usar: guardados ao importar, mas a receita nunca
 * foi criada (desistiu-se na revisao). So os com mais de um dia — um mais
 * recente pode ser de uma importacao a ser revista agora mesmo.
 */
export function orfaos(
  guardados: Array<{ pathname: string; uploadedAt: Date }>,
  usados: Set<string>,
  agora: Date = new Date(),
): string[] {
  return guardados
    .filter((b) => b.pathname.startsWith(PREFIXO_ORIGINAIS))
    .filter((b) => !usados.has(b.pathname))
    .filter((b) => agora.getTime() - b.uploadedAt.getTime() > FOLGA_ORFAOS_MS)
    .map((b) => b.pathname);
}

/** Todos os originais no Blob, pagina a pagina. */
export async function listarOriginais(): Promise<Array<{ pathname: string; uploadedAt: Date }>> {
  const out: Array<{ pathname: string; uploadedAt: Date }> = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIXO_ORIGINAIS, cursor, limit: 1000 });
    out.push(...r.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt) })));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
