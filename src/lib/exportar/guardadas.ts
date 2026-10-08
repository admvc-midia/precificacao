/**
 * Copias guardadas pela propria app no Blob privado: a que se grava sozinha
 * antes de cada restauro, para um restauro errado se poder desfazer.
 *
 * So se leem atraves da app (`/api/copias`), com sessao de dono.
 *
 * Fora de `lib/actions/` de proposito: grava sem validar quem pede.
 */

import { get, list, put } from '@vercel/blob';

import { blobConfigurado } from '@/lib/fotos';

export const PREFIXO_COPIAS = 'copias/';

export interface CopiaGuardada {
  caminho: string;
  gravadaEm: Date;
  tamanho: number;
}

/** Grava a copia e devolve o caminho. Sem Blob nao ha onde a guardar: rebenta. */
export async function guardarCopia(json: string, motivo: string): Promise<string> {
  if (!blobConfigurado()) {
    throw new Error('Falta o armazenamento de ficheiros (Blob): sem ele nao ha onde guardar a copia de antes, e nao se restaura sem ela.');
  }
  const quando = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const r = await put(`${PREFIXO_COPIAS}${motivo}-${quando}.json`, json, {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/json',
  });
  return r.pathname;
}

/** As guardadas, mais recentes primeiro. */
export async function listarCopias(): Promise<CopiaGuardada[]> {
  if (!blobConfigurado()) return [];
  const out: CopiaGuardada[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIXO_COPIAS, cursor, limit: 1000 });
    out.push(...r.blobs.map((b) => ({ caminho: b.pathname, gravadaEm: new Date(b.uploadedAt), tamanho: b.size })));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.gravadaEm.getTime() - a.gravadaEm.getTime());
}

/** So caminhos desta pasta, sem voltas: o pedido nao escolhe outro ficheiro do Blob. */
export function eCaminhoDeCopia(caminho: string): boolean {
  return /^copias\/[a-z0-9-]+\.json$/i.test(caminho);
}

export async function lerCopiaGuardada(caminho: string) {
  if (!eCaminhoDeCopia(caminho)) return null;
  const r = await get(caminho, { access: 'private' });
  return r && r.statusCode === 200 ? r : null;
}
