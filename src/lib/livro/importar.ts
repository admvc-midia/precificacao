/**
 * Do texto de um PDF (ou colado) para uma receita: titulo, ingredientes,
 * modo de preparo, rendimento, tempo e notas.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO CONSEGUE E O QUE NAO
 * ---------------------------------------------------------------------------
 * Cada PDF vem formatado a sua maneira. Isto procura os titulos habituais
 * ("Ingredientes", "Modo de preparo", "Rendimento"…) e junta as linhas que o
 * PDF partiu a meio de uma frase. Acerta na maior parte das receitas
 * escritas no Word ou tiradas de um site; nunca e o fim da linha — o
 * resultado abre sempre num ecra de revisao, com o texto original ao lado.
 *
 * PDFs digitalizados (fotografias de paginas) nao tem texto, e voltam vazios.
 */

import { semNumeracao } from './receita';

export interface ReceitaLida {
  title: string;
  ingredients: string[];
  steps: string[];
  yield: string | null;
  prepTime: string | null;
  notes: string | null;
  /** O que nao correu bem, para o ecra de revisao avisar. */
  avisos: string[];
}

type Seccao = 'ingredientes' | 'preparo' | 'notas' | null;

const TITULOS: Array<{ re: RegExp; seccao: Exclude<Seccao, null> }> = [
  { re: /^ingredientes?\b/i, seccao: 'ingredientes' },
  {
    re: /^(modo\s+de\s+(preparo|prepara[çc][ãa]o|fazer)|prepara[çc][ãa]o|preparo|instru[çc][õo]es|como\s+fazer|m[ée]todo)\b/i,
    seccao: 'preparo',
  },
  { re: /^(dicas?|notas?|observa[çc][õo]es|obs\.?)\b/i, seccao: 'notas' },
];

const RENDIMENTO = /^(rendimento|rende|serve|por[çc][õo]es|doses?)\s*[:\-–]?\s*(.*)$/i;
const TEMPO = /^(tempo(\s+de\s+(preparo|prepara[çc][ãa]o|forno|confe[çc][ãa]o))?|forno)\s*[:\-–]\s*(.*)$/i;
const MARCADOR = /^\s*(?:[•●▪◦‣∙·*–-]|\d{1,2}\s*[.)]|[a-z]\))\s+/i;
/** Linhas que sao so o numero da pagina, ou "Pagina 3 de 10". */
const LIXO = /^(\d{1,3}|p[áa]gina\s+\d+(\s+de\s+\d+)?)$/i;

function limpar(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => !LIXO.test(l));
}

/** Tira o titulo da seccao e devolve o que vinha a seguir na mesma linha. */
function restoDoTitulo(linha: string, re: RegExp): string {
  return linha.replace(re, '').replace(/^\s*[:\-–]\s*/, '').trim();
}

/**
 * Junta as linhas que o PDF partiu a meio. Uma linha comeca um item novo se
 * tem marcador ou numero; senao, se a anterior nao acabou em ponto, continua-a.
 */
function juntarPartidas(lista: string[], ingrediente: boolean): string[] {
  const out: string[] = [];
  for (const l of lista) {
    if (!l) continue;
    const novo = MARCADOR.test(l);
    const anterior = out[out.length - 1];
    const continua =
      anterior !== undefined &&
      !novo &&
      // Num ingrediente, so continua se a linha comecar em minuscula (frase partida).
      (ingrediente ? /^[a-zà-ú(]/.test(l) && !/[:.]$/.test(anterior) : !/[.!?:]$/.test(anterior));
    if (continua) out[out.length - 1] = `${anterior} ${l}`;
    else out.push(l);
  }
  return out.map((l) => l.replace(MARCADOR, '').trim()).filter(Boolean);
}

export function lerReceita(texto: string): ReceitaLida {
  const todas = limpar(texto);
  const avisos: string[] = [];

  let title = '';
  let rendimento: string | null = null;
  let tempo: string | null = null;
  const blocos: Record<Exclude<Seccao, null>, string[]> = { ingredientes: [], preparo: [], notas: [] };
  const antes: string[] = [];
  let seccao: Seccao = null;

  for (const linha of todas) {
    if (!linha) {
      if (seccao) blocos[seccao].push('');
      continue;
    }

    const r = RENDIMENTO.exec(linha);
    if (r && r[2] && linha.length < 80) {
      rendimento = r[2].trim();
      continue;
    }
    const t = TEMPO.exec(linha);
    if (t && t[4] && linha.length < 80) {
      tempo = t[4].trim();
      continue;
    }

    const titulo = TITULOS.find(({ re }) => re.test(linha));
    // Um titulo de seccao e curto ("Ingredientes") ou tem dois pontos logo a
    // seguir ("Preparação: leve tudo ao lume…"). "Preparo a massa com…" e um
    // passo, nao um titulo.
    if (titulo && (linha.length <= 40 || /^\s*[:\-–]/.test(linha.replace(titulo.re, '')))) {
      seccao = titulo.seccao;
      const resto = restoDoTitulo(linha, titulo.re);
      if (resto) blocos[seccao].push(resto);
      continue;
    }

    if (seccao) blocos[seccao].push(linha);
    else antes.push(linha);
  }

  // O titulo e a primeira linha curta antes das seccoes.
  const iTitulo = antes.findIndex((l) => l.length <= 80);
  if (iTitulo >= 0) {
    title = antes[iTitulo].replace(/[:.]$/, '');
    antes.splice(iTitulo, 1);
  } else {
    avisos.push('Nao encontrei o titulo.');
  }

  let ingredients = juntarPartidas(blocos.ingredientes, true);
  let steps = juntarPartidas(blocos.preparo, false).map(semNumeracao).filter(Boolean);

  // Sem titulos de seccao: o que tem marcador curto parece ingrediente, o resto preparo.
  if (ingredients.length === 0 && steps.length === 0 && antes.length > 0) {
    avisos.push('Nao encontrei os titulos "Ingredientes" e "Modo de preparo" — confira a separacao.');
    const curtos = antes.filter((l) => l.length <= 60 && (MARCADOR.test(l) || /^\d/.test(l)));
    ingredients = juntarPartidas(curtos, true);
    steps = juntarPartidas(
      antes.filter((l) => !curtos.includes(l)),
      false,
    ).map(semNumeracao);
    antes.length = 0;
  }

  if (ingredients.length === 0) avisos.push('Nao encontrei ingredientes.');
  if (steps.length === 0) avisos.push('Nao encontrei o modo de preparo.');
  if (todas.filter(Boolean).length === 0) {
    avisos.splice(0, avisos.length, 'O ficheiro nao tem texto. Se e uma digitalizacao (fotografia das paginas), copie o texto a mao.');
  }

  // O que sobrou antes das seccoes (uma introducao) vai para as notas.
  const notas = [antes.join(' ').trim(), juntarPartidas(blocos.notas, false).join('\n')]
    .filter(Boolean)
    .join('\n\n');

  return {
    title,
    ingredients,
    steps,
    yield: rendimento,
    prepTime: tempo,
    notes: notas || null,
    avisos,
  };
}

/** Texto de um PDF, pagina a pagina, separado por linhas em branco. */
export async function textoDoPdf(dados: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(dados);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n\n');
}
