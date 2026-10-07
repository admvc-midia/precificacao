/**
 * Diferencas entre duas versoes de uma receita, linha a linha.
 *
 * Um ingrediente e uma linha; um passo e um paragrafo. A comparacao e a
 * classica: a maior subsequencia comum (LCS) diz o que ficou igual, e o resto
 * e o que saiu e o que entrou. Uma receita tem dezenas de linhas, nao
 * milhares — a tabela O(n×m) cabe a vontade, e assim nao ha dependencia.
 *
 * Quando uma linha sai e outra entra no mesmo sitio ("200 g de acucar" →
 * "150 g de acucar"), marcam-se tambem as palavras que mudaram, para se ver
 * logo que foi o 200 que passou a 150.
 */

export type Operacao = 'igual' | 'saiu' | 'entrou';

export interface Pedaco {
  tipo: Operacao;
  texto: string;
}

export interface LinhaDiff {
  tipo: Operacao | 'mudou';
  /** A linha antiga (igual, saiu, mudou). */
  antes?: string;
  /** A linha nova (igual, entrou, mudou). */
  depois?: string;
  /** Em 'mudou': as palavras, com o que saiu e o que entrou. */
  palavras?: Pedaco[];
}

/** LCS generico: devolve a sequencia de operacoes de `a` para `b`. */
function lcs<T>(a: T[], b: T[], igual: (x: T, y: T) => boolean): Array<{ tipo: Operacao; valor: T }> {
  const n = a.length;
  const m = b.length;
  // t[i][j] = tamanho da LCS de a[i..] e b[j..].
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = igual(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const out: Array<{ tipo: Operacao; valor: T }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (igual(a[i], b[j])) {
      out.push({ tipo: 'igual', valor: b[j] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      out.push({ tipo: 'saiu', valor: a[i++] });
    } else {
      out.push({ tipo: 'entrou', valor: b[j++] });
    }
  }
  while (i < n) out.push({ tipo: 'saiu', valor: a[i++] });
  while (j < m) out.push({ tipo: 'entrou', valor: b[j++] });
  return out;
}

/**
 * Compara linhas ignorando espacos a mais e maiusculas — "200 g  de Acucar" e
 * "200 g de acucar" sao a mesma linha, e marca-las como mudadas so faria
 * ruido.
 */
function chave(linha: string): string {
  return linha.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Diferenca entre duas palavras-listas, juntando pedacos seguidos do mesmo tipo. */
export function diffPalavras(antes: string, depois: string): Pedaco[] {
  // Mantem os espacos como tokens, para o texto se recompor tal e qual.
  const a = antes.split(/(\s+)/).filter(Boolean);
  const b = depois.split(/(\s+)/).filter(Boolean);
  const ops = lcs(a, b, (x, y) => x.toLowerCase() === y.toLowerCase());
  const out: Pedaco[] = [];
  for (const { tipo, valor } of ops) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += valor;
    else out.push({ tipo, texto: valor });
  }
  return out;
}

/**
 * Diferenca entre duas listas de linhas. Um bloco de linhas que saem seguido
 * de um bloco que entra emparelha-se, uma a uma, como "mudou" — e o caso de
 * uma quantidade alterada. O que sobra de um lado fica como saiu/entrou.
 */
export function diffLinhas(antes: string[], depois: string[]): LinhaDiff[] {
  const ops = lcs(antes, depois, (x, y) => chave(x) === chave(y));
  const out: LinhaDiff[] = [];

  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.tipo === 'igual') {
      out.push({ tipo: 'igual', antes: op.valor, depois: op.valor });
      k++;
      continue;
    }
    // Um bloco seguido de saidas e entradas, em qualquer ordem.
    const saidas: string[] = [];
    const entradas: string[] = [];
    while (k < ops.length && ops[k].tipo !== 'igual') {
      if (ops[k].tipo === 'saiu') saidas.push(ops[k].valor);
      else entradas.push(ops[k].valor);
      k++;
    }
    const pares = Math.min(saidas.length, entradas.length);
    for (let p = 0; p < pares; p++) {
      out.push({
        tipo: 'mudou',
        antes: saidas[p],
        depois: entradas[p],
        palavras: diffPalavras(saidas[p], entradas[p]),
      });
    }
    for (const s of saidas.slice(pares)) out.push({ tipo: 'saiu', antes: s });
    for (const e of entradas.slice(pares)) out.push({ tipo: 'entrou', depois: e });
  }
  return out;
}

/** Se ha alguma diferenca. */
export function mudou(d: LinhaDiff[]): boolean {
  return d.some((l) => l.tipo !== 'igual');
}

/** Contagem para o resumo: "3 mudaram, 1 entrou, 1 saiu". */
export function resumo(d: LinhaDiff[]): { mudaram: number; entraram: number; sairam: number } {
  return {
    mudaram: d.filter((l) => l.tipo === 'mudou').length,
    entraram: d.filter((l) => l.tipo === 'entrou').length,
    sairam: d.filter((l) => l.tipo === 'saiu').length,
  };
}
