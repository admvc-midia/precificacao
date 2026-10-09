/**
 * Ler as linhas de ingredientes de uma receita do livro ("200 g de chocolate",
 * "1 lata de leite condensado", "3 ovos", "acucar q.b.") para propor uma ficha
 * tecnica. Sem base de dados.
 *
 * ---------------------------------------------------------------------------
 * PROPOR, NUNCA DECIDIR
 * ---------------------------------------------------------------------------
 * O que aqui sai e uma PROPOSTA para o dono rever linha a linha. Medidas de
 * cozinha (lata, colher, chavena) nao viram gramas sozinhas: uma lata de leite
 * condensado e 395 g, uma de creme de leite 200 g, e uma chavena de farinha
 * nao pesa o mesmo que uma de acucar. Adivinhar errava os custos em silencio
 * (a mesma razao por que a app nao converte litros em quilos). Essas linhas
 * vem sem quantidade, com o motivo, e o dono escreve-a.
 */

import { normalizar } from './receita';

export type UnidadeLida = 'G' | 'KG' | 'ML' | 'L' | 'UN';

export interface LinhaLida {
  original: string;
  /** Titulo de grupo ("Massa:", "Recheio"): nao e ingrediente. */
  titulo: boolean;
  qty: number | null;
  /** Unidade que se converte (peso, volume, contagem); nula numa medida de cozinha. */
  unidade: UnidadeLida | null;
  /** "lata", "colher de sopa"... quando a quantidade vem nessa medida. */
  medida: string | null;
  /** "q.b.", "a gosto": nao tem quantidade. */
  aGosto: boolean;
  /** O que sobra: o nome do ingrediente. */
  nome: string;
}

const FRACOES: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const POR_EXTENSO: Record<string, number> = {
  meia: 0.5,
  meio: 0.5,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  doze: 12,
};

/** Unidades que se convertem. As chaves ja vem sem acentos e em minusculas. */
const UNIDADES: Array<[RegExp, UnidadeLida]> = [
  [/^(kg|kgs|quilo|quilos|kilo|kilos|quilograma|quilogramas)$/, 'KG'],
  [/^(g|gr|grs|grama|gramas)$/, 'G'],
  [/^(ml|mililitro|mililitros)$/, 'ML'],
  [/^(l|lt|lts|litro|litros)$/, 'L'],
  [/^(un|und|unid|unidade|unidades)$/, 'UN'],
];

/** Medidas de cozinha: a quantidade fica, mas nao se converte. */
const MEDIDAS: Array<[RegExp, string]> = [
  [/^colher(es)? (de )?(sopa)$/, 'colher de sopa'],
  [/^colher(es)? (de )?(cha)$/, 'colher de chá'],
  [/^colher(es)? (de )?(sobremesa)$/, 'colher de sobremesa'],
  [/^colher(es)? (de )?(cafe)$/, 'colher de café'],
  [/^colher(es)?$/, 'colher'],
  [/^(xicara|xicaras|chavena|chavenas)( de cha)?$/, 'chávena'],
  [/^(copo|copos)$/, 'copo'],
  [/^(lata|latas)$/, 'lata'],
  [/^(caixa|caixas|caixinha|caixinhas)$/, 'caixa'],
  [/^(pacote|pacotes|pacotinho|pacotinhos|saqueta|saquetas)$/, 'pacote'],
  [/^(pitada|pitadas)$/, 'pitada'],
  [/^(fio|fios)$/, 'fio'],
  [/^(dente|dentes)$/, 'dente'],
  [/^(fatia|fatias)$/, 'fatia'],
  [/^(folha|folhas)$/, 'folha'],
  [/^(tablete|tabletes|barra|barras)$/, 'tablete'],
];

const A_GOSTO = /\b(q\.?\s?b\.?|a gosto|quanto baste|para polvilhar|para untar)\b/;
const LIGACAO = /^(de|do|da|dos|das)\s+/;

/** Um numero no inicio ("1", "1,5", "1/2", "1 1/2", "1 e 1/2", "½", "meia"). */
function lerNumero(t: string): { valor: number; resto: string } | null {
  const s = t.trimStart();
  let m: RegExpExecArray | null;
  // "1 1/2" ou "1 e 1/2"
  if ((m = /^(\d+)\s+(?:e\s+)?(\d+)\/(\d+)(?=\s|$|[a-z])/.exec(s))) {
    return { valor: Number(m[1]) + Number(m[2]) / Number(m[3]), resto: s.slice(m[0].length) };
  }
  if ((m = /^(\d+)\/(\d+)(?=\s|$|[a-z])/.exec(s))) {
    return { valor: Number(m[1]) / Number(m[2]), resto: s.slice(m[0].length) };
  }
  if ((m = /^(\d+)?\s*([½¼¾⅓⅔⅛])/.exec(s))) {
    return { valor: (m[1] ? Number(m[1]) : 0) + FRACOES[m[2]], resto: s.slice(m[0].length) };
  }
  if ((m = /^(\d+(?:[.,]\d+)?)/.exec(s))) {
    return { valor: Number(m[1].replace(',', '.')), resto: s.slice(m[0].length) };
  }
  if ((m = /^([a-z]+)\b/.exec(s)) && POR_EXTENSO[m[1]] !== undefined) {
    return { valor: POR_EXTENSO[m[1]], resto: s.slice(m[0].length) };
  }
  return null;
}

/** Uma unidade ou medida logo a seguir ao numero; tenta 3, 2 e 1 palavras. */
function lerUnidade(resto: string): { unidade: UnidadeLida | null; medida: string | null; resto: string } {
  const r = resto.trimStart();
  const palavras = r.split(/\s+/);
  for (let n = Math.min(4, palavras.length); n >= 1; n--) {
    const pedaco = palavras.slice(0, n).join(' ').replace(/[.,;:]$/, '');
    for (const [re, u] of UNIDADES) if (re.test(pedaco)) return { unidade: u, medida: null, resto: palavras.slice(n).join(' ') };
    for (const [re, m] of MEDIDAS) if (re.test(pedaco)) return { unidade: null, medida: m, resto: palavras.slice(n).join(' ') };
  }
  // "200g" colado ao numero ja foi separado: "g de chocolate"
  return { unidade: null, medida: null, resto: r };
}

function limparNome(nome: string): string {
  return nome
    .replace(LIGACAO, '')
    .replace(/\s*[-–—:]\s*$/, '')
    .replace(/[.;,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le uma linha de ingredientes. `null` numa linha vazia. */
export function lerLinha(original: string): LinhaLida | null {
  const limpa = original.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim();
  if (!limpa) return null;

  // "Massa:", "Para o recheio:" — titulos de grupo, sem numeros.
  if (/:$/.test(limpa) && !/\d/.test(limpa)) {
    return { original, titulo: true, qty: null, unidade: null, medida: null, aGosto: false, nome: limpa.replace(/:$/, '') };
  }

  // Trabalha-se em minusculas sem acentos, mas o nome devolvido mantem a
  // forma escrita (para o ecra), pela mesma posicao.
  const base = normalizar(limpa);
  const aGosto = A_GOSTO.test(base);

  const tentar = (texto: string) => {
    const n = lerNumero(texto);
    if (!n) return null;
    const u = lerUnidade(n.resto);
    return { qty: n.valor, ...u };
  };

  // Quantidade no inicio ("200 g de chocolate").
  let lida = tentar(base);
  let nomeNormalizado = lida?.resto ?? base;

  // Quantidade no fim ("Chocolate - 200 g", "Leite condensado 1 lata").
  if (!lida) {
    const m = /^(.*?)[\s\-–—:]+((?:\d|[½¼¾⅓⅔⅛]).*)$/.exec(base);
    if (m) {
      const fim = tentar(m[2]);
      if (fim && (fim.unidade || fim.medida) && !fim.resto.trim()) {
        lida = fim;
        nomeNormalizado = m[1];
      }
    }
  }

  // O nome com a grafia original: corta-se pelo mesmo comprimento.
  const nome = limparNome(recuperarGrafia(limpa, base, nomeNormalizado)).replace(A_GOSTO_ORIGINAL, '').trim();
  const temQty = lida !== null && Number.isFinite(lida.qty) && lida.qty > 0;
  return {
    original,
    titulo: false,
    qty: temQty ? lida!.qty : null,
    // So numero, sem unidade nem medida: e contagem ("3 ovos").
    unidade: temQty ? (lida!.unidade ?? (lida!.medida ? null : 'UN')) : null,
    medida: temQty ? lida!.medida : null,
    aGosto,
    nome: limparNome(nome) || limparNome(nomeNormalizado),
  };
}

const A_GOSTO_ORIGINAL = /\s*\(?\b(q\.?\s?b\.?|a gosto|quanto baste)\)?\s*$/i;

/**
 * O pedaco de `original` que corresponde a `pedacoNormalizado` dentro de
 * `normalizado` (mesmo texto, so sem acentos e em minusculas). `normalizar`
 * mantem o comprimento quando so tira acentos; se nao manteve, fica a versao
 * normalizada, que tambem serve.
 */
function recuperarGrafia(original: string, normalizado: string, pedacoNormalizado: string): string {
  const i = normalizado.indexOf(pedacoNormalizado);
  if (i < 0 || original.length !== normalizado.length) return pedacoNormalizado;
  return original.slice(i, i + pedacoNormalizado.length);
}

export function lerIngredientes(texto: string): LinhaLida[] {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(lerLinha)
    .filter((l): l is LinhaLida => l !== null);
}

/** "Rende 16 fatias", "16 porcoes", "Rendimento: 2 bolos" → 16 / 16 / 2. */
export function lerRendimento(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(texto);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// O insumo mais parecido
// ---------------------------------------------------------------------------

const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'para', 'e', 'a', 'o', 'em', 'tipo', 'ou']);

/** Palavras que contam: sem acentos, sem as de ligacao, singular aproximado. */
export function palavras(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p));
}

export interface Candidato {
  /** "ING:<id>" ou "REC:<id>", como no formulario da ficha. */
  ref: string;
  nome: string;
}

/**
 * O candidato com mais palavras em comum (coeficiente de Dice), se passar de
 * metade. Empate: o de nome mais curto, que e o mais generico ("Leite" antes
 * de "Leite em po magro").
 */
export function maisParecido(nome: string, candidatos: Candidato[]): { ref: string; nota: number } | null {
  const a = new Set(palavras(nome));
  if (a.size === 0) return null;
  let melhor: { ref: string; nota: number; tamanho: number } | null = null;
  for (const c of candidatos) {
    const b = new Set(palavras(c.nome));
    if (b.size === 0) continue;
    let comum = 0;
    for (const p of a) if (b.has(p)) comum++;
    const nota = (2 * comum) / (a.size + b.size);
    if (nota < 0.5) continue;
    if (!melhor || nota > melhor.nota || (nota === melhor.nota && b.size < melhor.tamanho)) {
      melhor = { ref: c.ref, nota, tamanho: b.size };
    }
  }
  return melhor ? { ref: melhor.ref, nota: melhor.nota } : null;
}

// ---------------------------------------------------------------------------
// A quantidade na unidade da ficha
// ---------------------------------------------------------------------------

export type BaseDoAlvo = 'G' | 'ML' | 'UN';

/**
 * A quantidade da linha na unidade em que a ficha a guarda (kg, L ou un),
 * ou o motivo por que nao se converte sozinha.
 */
export function quantidadeNaFicha(
  l: Pick<LinhaLida, 'qty' | 'unidade' | 'medida' | 'aGosto'>,
  base: BaseDoAlvo,
): { qty: number; unit: 'KG' | 'L' | 'UN' } | { motivo: string } {
  if (l.qty == null) return { motivo: l.aGosto ? 'q.b. / a gosto: escreva quanto usa' : 'sem quantidade na receita' };
  const u = l.unidade;
  if (base === 'G') {
    if (u === 'G') return { qty: l.qty / 1000, unit: 'KG' };
    if (u === 'KG') return { qty: l.qty, unit: 'KG' };
    if (u === 'ML' || u === 'L') return { motivo: 'em volume: escreva o peso em kg' };
    return { motivo: l.medida ? `${l.qty} ${l.medida}: escreva o peso em kg` : `${l.qty} un.: escreva o peso em kg` };
  }
  if (base === 'ML') {
    if (u === 'ML') return { qty: l.qty / 1000, unit: 'L' };
    if (u === 'L') return { qty: l.qty, unit: 'L' };
    return { motivo: l.medida ? `${l.qty} ${l.medida}: escreva o volume em L` : 'escreva o volume em L' };
  }
  // Por unidade: contagens e embalagens ("3 ovos", "1 lata").
  if (u === 'UN' || (u === null && l.medida && /lata|caixa|pacote|tablete/.test(l.medida))) {
    return { qty: l.qty, unit: 'UN' };
  }
  return { motivo: u === 'G' || u === 'KG' ? 'em peso, mas o insumo e por unidade: escreva quantas' : 'escreva quantas unidades' };
}
