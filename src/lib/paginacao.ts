/**
 * As contas da paginacao, sem React: quantas paginas, que fatia, que botoes.
 *
 * Serve as duas formas de paginar da app — por link (Estoque, no servidor,
 * para o historico todo nao vir de uma vez) e por estado (as listas de
 * cliente, que ja tem as linhas todas e so escolhem quais mostrar).
 */

export interface Pagina {
  /** Pagina atual, ja corrigida para dentro dos limites (comeca em 1). */
  atual: number;
  total: number;
  /** Indices da fatia: `linhas.slice(inicio, fim)`. */
  inicio: number;
  fim: number;
  /** "1–20 de 57". Vazio quando cabe tudo numa pagina. */
  rotulo: string;
}

export function pagina(totalItens: number, porPagina: number, pedida: number): Pagina {
  const total = Math.max(1, Math.ceil(totalItens / porPagina));
  // Uma pagina que deixou de existir (apagou-se um item, a busca encolheu a
  // lista) cai na ultima em vez de mostrar uma lista vazia.
  const atual = Math.min(Math.max(1, Math.floor(pedida) || 1), total);
  const inicio = (atual - 1) * porPagina;
  const fim = Math.min(inicio + porPagina, totalItens);
  const rotulo = totalItens > porPagina ? `${inicio + 1}–${fim} de ${totalItens}` : '';
  return { atual, total, inicio, fim, rotulo };
}

/**
 * Os numeros a mostrar, com `null` onde vao reticencias:
 * [1, null, 4, 5, 6, null, 12]. Nunca mais de 7 botoes — cabe no telemovel.
 */
export function botoes(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((n) => n > 1 && n < total);
  if (atual <= 3) return [1, 2, 3, 4, 5, null, total];
  if (atual >= total - 2) return [1, null, total - 4, total - 3, total - 2, total - 1, total];
  return [1, null, ...meio, null, total];
}
