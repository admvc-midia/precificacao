/**
 * As fotos do cardapio publico: de onde vem a foto de um item, e os enderecos
 * das rotas publicas (`/api/cardapio/foto/...`). Sem base de dados.
 *
 * O `v` dos enderecos e o fim do caminho no Blob, que muda a cada foto nova:
 * e o que deixa as rotas mandar guardar em cache para sempre.
 */

/** O endereco publico da foto de um item (so serve se estiver publicado). */
export function fotoPublicaSrc(
  itemId: string,
  caminho: string | null | undefined,
  tamanho: 'grande' | 'mini' = 'grande',
): string | null {
  if (!caminho) return null;
  const v = encodeURIComponent(caminho.slice(-24));
  return `/api/cardapio/foto/${itemId}?${tamanho === 'mini' ? 'tam=mini&' : ''}v=${v}`;
}

/** A foto de capa de uma secao (so serve se estiver publicada). */
export function fotoDaSecaoSrc(
  secaoId: string,
  caminho: string | null | undefined,
  tamanho: 'grande' | 'mini' = 'grande',
): string | null {
  if (!caminho) return null;
  const v = encodeURIComponent(caminho.slice(-24));
  return `/api/cardapio/foto/secao/${secaoId}?${tamanho === 'mini' ? 'tam=mini&' : ''}v=${v}`;
}

type ComFoto = { photoPath: string | null; photoThumbPath: string | null };

/**
 * O caminho da foto de um item: a propria, senao a da ficha, senao (num
 * combo) a da primeira ficha que a tenha.
 */
export function caminhoDaFoto(item: ComFoto & {
  recipe: ComFoto | null;
  components: Array<{ recipe: ComFoto }>;
}): { photoPath: string; photoThumbPath: string | null } | null {
  const fontes = [item, ...(item.recipe ? [item.recipe] : item.components.map((c) => c.recipe))];
  const f = fontes.find((r) => r.photoPath);
  return f?.photoPath ? { photoPath: f.photoPath, photoThumbPath: f.photoThumbPath } : null;
}
