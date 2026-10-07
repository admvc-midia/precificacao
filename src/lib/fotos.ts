/**
 * Fotos dos produtos no Vercel Blob.
 *
 * O store (`precificacao-blob`) e **privado**: um URL dele nao abre sem o
 * token. Por isso a base guarda o caminho, e a foto chega ao browser atraves
 * de `/api/fotos/<id>`, que exige sessao como o resto da app. Quem nao entrou
 * nao ve as fotos, mesmo que apanhe o endereco.
 *
 * Fora de `lib/actions/` de proposito: estas funcoes gravam e apagam sem
 * validar quem pede — quem as chama e que valida.
 */

import { del, get, put } from '@vercel/blob';

/** O telemovel reduz antes de enviar (1600 px, JPEG); isto e so o travao. */
export const MAX_FOTO = 1_500_000;
export const MAX_MINI = 300_000;

export function blobConfigurado(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * O tipo pelos primeiros bytes, nao pelo que o browser diz. Um ficheiro
 * qualquer com o nome mudado para .jpg nao entra.
 */
export function tipoDaImagem(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const txt = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (txt(0, 4) === 'RIFF' && txt(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXTENSAO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Valida e le um ficheiro do formulario. Erros em portugues, para o ecra. */
export async function lerImagem(
  valor: FormDataEntryValue | null,
  maximo: number,
  nome: string,
): Promise<{ bytes: Uint8Array; tipo: keyof typeof EXTENSAO }> {
  if (!(valor instanceof Blob) || valor.size === 0) throw new Error(`Falta a ${nome}.`);
  if (valor.size > maximo) {
    throw new Error(`A ${nome} e grande demais (${Math.round(valor.size / 1000)} KB).`);
  }
  const bytes = new Uint8Array(await valor.arrayBuffer());
  const tipo = tipoDaImagem(bytes);
  if (!tipo) throw new Error(`A ${nome} nao e uma imagem JPEG, PNG ou WebP.`);
  return { bytes, tipo };
}

/**
 * Grava a foto e a miniatura. O sufixo aleatorio faz de cada foto nova um
 * caminho novo — ver `photoPath` no schema.
 */
export async function gravarFotos(
  recipeId: string,
  foto: { bytes: Uint8Array; tipo: keyof typeof EXTENSAO },
  mini: { bytes: Uint8Array; tipo: keyof typeof EXTENSAO },
  /** `fotos` para as fichas, `livro/fotos` para as receitas do livro. */
  pasta = 'fotos',
): Promise<{ photoPath: string; photoThumbPath: string }> {
  if (!blobConfigurado()) {
    throw new Error('As fotos nao estao configuradas: falta a variavel BLOB_READ_WRITE_TOKEN.');
  }
  const opcoes = (tipo: string) => ({
    access: 'private' as const,
    addRandomSuffix: true,
    contentType: tipo,
  });
  const [a, b] = await Promise.all([
    put(`${pasta}/${recipeId}.${EXTENSAO[foto.tipo]}`, Buffer.from(foto.bytes), opcoes(foto.tipo)),
    put(`${pasta}/${recipeId}-mini.${EXTENSAO[mini.tipo]}`, Buffer.from(mini.bytes), opcoes(mini.tipo)),
  ]);
  return { photoPath: a.pathname, photoThumbPath: b.pathname };
}

/**
 * Apaga do Blob. Nunca rebenta: um ficheiro que ficou para tras ocupa espaco,
 * mas uma ficha que nao se consegue apagar por causa dele e pior.
 */
export async function apagarFotos(caminhos: (string | null | undefined)[]): Promise<void> {
  const validos = caminhos.filter((c): c is string => Boolean(c));
  if (validos.length === 0 || !blobConfigurado()) return;
  try {
    await del(validos);
  } catch (err) {
    console.warn('[fotos] nao consegui apagar', validos, err);
  }
}

/** Le uma foto do store privado. `null` se nao existir. */
export async function lerFoto(caminho: string) {
  const r = await get(caminho, { access: 'private' });
  return r && r.statusCode === 200 ? r : null;
}
