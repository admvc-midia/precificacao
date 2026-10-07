/**
 * O endereco da foto de uma ficha, para `<img src>`.
 *
 * O `v` e o fim do caminho no Blob, que tem sufixo aleatorio e muda a cada
 * foto nova: e o que deixa a rota mandar guardar em cache para sempre (ver
 * `api/fotos/[id]/route.ts`). Sem foto, `null`.
 */
export function fotoSrc(
  recipeId: string,
  caminho: string | null | undefined,
  tamanho: 'grande' | 'mini' = 'grande',
): string | null {
  if (!caminho) return null;
  const v = encodeURIComponent(caminho.slice(-24));
  return `/api/fotos/${recipeId}?${tamanho === 'mini' ? 'tam=mini&' : ''}v=${v}`;
}

/** O mesmo, para a foto de uma receita do livro (que qualquer conta pode ver). */
export function fotoReceitaSrc(
  receitaId: string,
  caminho: string | null | undefined,
  tamanho: 'grande' | 'mini' = 'grande',
): string | null {
  if (!caminho) return null;
  const v = encodeURIComponent(caminho.slice(-24));
  return `/api/receitas/${receitaId}/foto?${tamanho === 'mini' ? 'tam=mini&' : ''}v=${v}`;
}
