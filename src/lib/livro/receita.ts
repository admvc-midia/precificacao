/**
 * Receitas do livro: como o texto se parte em ingredientes e passos, de onde
 * veio, e a busca.
 *
 * Os ingredientes e os passos guardam-se como texto (ver `BookRecipeVersion`):
 * uma linha por ingrediente, um paragrafo por passo. Texto porque as receitas
 * de familia nao tem estrutura — "uma pitada", "farinha q.b.", "o tabuleiro
 * grande da avo" — e forca-las em quantidade + unidade estragava-as. Quem
 * precisa de quantidades exatas e a ficha tecnica, que se liga a receita.
 */

export type SourceKind = 'FAMILY' | 'COURSE' | 'BOOK' | 'INTERNET' | 'OWN' | 'OTHER';

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  FAMILY: 'Receita de família',
  COURSE: 'Curso',
  BOOK: 'Livro ou revista',
  INTERNET: 'Internet',
  OWN: 'Criação da casa',
  OTHER: 'Outra',
};

/** Ingredientes: uma linha cada, sem vazias nem espacos a volta. */
export function linhas(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Passos: separados por linha em branco. Sem linhas em branco, cada linha e um
 * passo — e o que acontece quando alguem escreve um por linha.
 */
export function passos(texto: string): string[] {
  const t = texto.replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  const porParagrafo = t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim());
  if (porParagrafo.length > 1) return porParagrafo.filter(Boolean);
  return linhas(t);
}

/** O inverso de `passos`, para o campo de texto. */
export function juntarPassos(lista: string[]): string {
  return lista.map((p) => p.trim()).filter(Boolean).join('\n\n');
}

/** "1. Bata os ovos" → "Bata os ovos": a numeracao e a app que a poe. */
export function semNumeracao(passo: string): string {
  return passo.replace(/^\s*(?:passo\s*)?\d{1,2}\s*[.)º°:-]\s*/i, '').trim();
}

/** Etiquetas: separadas por virgula, minusculas, sem repetidas. */
export function lerEtiquetas(raw: string): string[] {
  const vistas = new Set<string>();
  for (const t of raw.split(',')) {
    const e = t.trim().toLowerCase();
    if (e) vistas.add(e);
  }
  return [...vistas].slice(0, 20);
}

/** Minusculas sem acentos, para "Pão" casar com "pao". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Se a receita casa com a busca. Todas as palavras tem de aparecer, em
 * qualquer campo: "bolo cenoura" encontra o "Bolo de cenoura da avo" e uma
 * receita que tenha cenoura nos ingredientes e "bolo" no titulo.
 */
export function casaComBusca(
  busca: string,
  campos: Array<string | null | undefined>,
): boolean {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const tudo = normalizar(campos.filter(Boolean).join(' \n '));
  return palavras.every((p) => tudo.includes(p));
}

/** Uma URL so se for http(s) — `javascript:` num link seria uma porta aberta. */
export function urlSegura(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
