/**
 * A marcacao minima dos textos do cardapio.
 *
 * O dono escreve num `<textarea>`; o cardapio publico desenha com a
 * identidade do menu em PDF. Nada de HTML vindo da base — o texto vira
 * blocos e o React escreve-os, por isso nao ha como injetar nada na pagina
 * publica.
 *
 *   ## Massa                     subtitulo rosa sublinhado
 *   ## Recheios (de 1 ate 3)     o que esta entre parenteses no fim fica pequeno
 *   ### Pedidos                  pilula lilas
 *   - Baunilha                   marcador verde
 *   > Os valores dependem...     destaque roxo
 *   ~ *Amendoas caramelizadas    nota pequena
 *   **negrito** em qualquer linha
 *
 * Linhas seguidas sem marcador juntam-se num paragrafo; uma linha vazia
 * separa paragrafos.
 */

export type Trecho = { texto: string; negrito: boolean };

export type Bloco =
  | { tipo: 'subtitulo'; texto: string; aparte: string | null }
  | { tipo: 'pilula'; texto: string }
  | { tipo: 'lista'; itens: Trecho[][] }
  | { tipo: 'destaque'; trechos: Trecho[] }
  | { tipo: 'nota'; trechos: Trecho[] }
  | { tipo: 'paragrafo'; trechos: Trecho[] };

/** "o **bolo** gelado" → [o ][bolo*][ gelado]. Um `**` sem par fica como esta. */
export function trechos(linha: string): Trecho[] {
  const out: Trecho[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (const m of linha.matchAll(re)) {
    if (m.index! > ultimo) out.push({ texto: linha.slice(ultimo, m.index), negrito: false });
    out.push({ texto: m[1], negrito: true });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < linha.length) out.push({ texto: linha.slice(ultimo), negrito: false });
  return out;
}

export function lerTexto(raw: string | null | undefined): Bloco[] {
  if (!raw) return [];
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];

  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', trechos: trechos(paragrafo.join(' ')) });
    paragrafo = [];
  };

  for (const bruta of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const linha = bruta.trim();
    if (!linha) {
      fecharParagrafo();
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = /^###\s+(.+)$/.exec(linha))) {
      fecharParagrafo();
      blocos.push({ tipo: 'pilula', texto: m[1].trim() });
    } else if ((m = /^##\s+(.+)$/.exec(linha))) {
      fecharParagrafo();
      const t = m[1].trim();
      const aparte = /^(.*?)\s*(\([^()]*\))$/.exec(t);
      blocos.push(
        aparte && aparte[1]
          ? { tipo: 'subtitulo', texto: aparte[1], aparte: aparte[2] }
          : { tipo: 'subtitulo', texto: t, aparte: null },
      );
    } else if ((m = /^[-•]\s+(.+)$/.exec(linha))) {
      fecharParagrafo();
      const anterior = blocos[blocos.length - 1];
      if (anterior?.tipo === 'lista') anterior.itens.push(trechos(m[1]));
      else blocos.push({ tipo: 'lista', itens: [trechos(m[1])] });
    } else if ((m = /^>\s?(.+)$/.exec(linha))) {
      fecharParagrafo();
      blocos.push({ tipo: 'destaque', trechos: trechos(m[1]) });
    } else if ((m = /^~\s?(.+)$/.exec(linha))) {
      fecharParagrafo();
      blocos.push({ tipo: 'nota', trechos: trechos(m[1]) });
    } else {
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  return blocos;
}
