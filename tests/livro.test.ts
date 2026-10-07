import { describe, expect, it } from 'vitest';

import { diffLinhas, diffPalavras, mudou, resumo } from '@/lib/livro/diff';
import { orfaos } from '@/lib/livro/ficheiros';
import { lerReceita, textoDoPdf } from '@/lib/livro/importar';
import {
  casaComBusca,
  juntarPassos,
  lerEtiquetas,
  passos,
  semNumeracao,
  urlSegura,
} from '@/lib/livro/receita';

describe('diff entre versoes', () => {
  const original = ['3 ovos', '200 g de açúcar', '1 chávena de óleo', '2 cenouras'];

  it('igual e igual, mesmo com espacos e maiusculas diferentes', () => {
    const d = diffLinhas(original, ['3 Ovos', '200 g  de açúcar', '1 chávena de óleo', '2 cenouras']);
    expect(mudou(d)).toBe(false);
  });

  it('uma quantidade alterada e "mudou", com a palavra marcada', () => {
    const d = diffLinhas(original, ['3 ovos', '150 g de açúcar', '1 chávena de óleo', '2 cenouras']);
    expect(d.map((l) => l.tipo)).toEqual(['igual', 'mudou', 'igual', 'igual']);
    const linha = d[1];
    expect(linha.palavras!.filter((p) => p.tipo === 'saiu').map((p) => p.texto)).toEqual(['200']);
    expect(linha.palavras!.filter((p) => p.tipo === 'entrou').map((p) => p.texto)).toEqual(['150']);
  });

  it('linhas que entram e saem', () => {
    // O oleo sai a meio e a laranja entra no fim: nao estao lado a lado, nao e "mudou".
    const d = diffLinhas(original, ['3 ovos', '200 g de açúcar', '2 cenouras', 'raspa de laranja']);
    expect(resumo(d)).toEqual({ mudaram: 0, entraram: 1, sairam: 1 });
    // No mesmo sitio, e "mudou".
    const d1 = diffLinhas(original, ['3 ovos', '200 g de açúcar', 'raspa de laranja', '2 cenouras']);
    expect(resumo(d1)).toEqual({ mudaram: 1, entraram: 0, sairam: 0 });
    const d2 = diffLinhas(original, ['3 ovos', '200 g de açúcar', '1 chávena de óleo', '2 cenouras', 'raspa de laranja']);
    expect(resumo(d2)).toEqual({ mudaram: 0, entraram: 1, sairam: 0 });
    const d3 = diffLinhas(original, ['3 ovos', '2 cenouras']);
    expect(resumo(d3)).toEqual({ mudaram: 0, entraram: 0, sairam: 2 });
  });

  it('as palavras recompoem o texto tal e qual', () => {
    const p = diffPalavras('leve ao forno 40 minutos', 'leve ao forno a 180 °C durante 35 minutos');
    expect(p.filter((x) => x.tipo !== 'saiu').map((x) => x.texto).join('')).toBe(
      'leve ao forno a 180 °C durante 35 minutos',
    );
    expect(p.filter((x) => x.tipo !== 'entrou').map((x) => x.texto).join('')).toBe(
      'leve ao forno 40 minutos',
    );
  });

  it('listas vazias', () => {
    expect(diffLinhas([], [])).toEqual([]);
    expect(resumo(diffLinhas([], ['a']))).toEqual({ mudaram: 0, entraram: 1, sairam: 0 });
  });
});

describe('texto da receita', () => {
  it('passos por paragrafo, ou um por linha', () => {
    expect(passos('Bata os ovos.\n\nJunte o açúcar\ne mexa.')).toEqual([
      'Bata os ovos.',
      'Junte o açúcar e mexa.',
    ]);
    expect(passos('Bata\nJunte\nLeve ao forno')).toEqual(['Bata', 'Junte', 'Leve ao forno']);
    expect(juntarPassos(['a', ' b ', ''])).toBe('a\n\nb');
  });

  it('tira a numeracao, que e a app que a poe', () => {
    expect(semNumeracao('1. Bata os ovos')).toBe('Bata os ovos');
    expect(semNumeracao('2) Junte')).toBe('Junte');
    expect(semNumeracao('Passo 3: Leve ao forno')).toBe('Leve ao forno');
    expect(semNumeracao('200 g de açúcar')).toBe('200 g de açúcar');
  });

  it('etiquetas', () => {
    expect(lerEtiquetas(' Bolos, chocolate,bolos , ')).toEqual(['bolos', 'chocolate']);
  });

  it('busca sem acentos, todas as palavras, em qualquer campo', () => {
    const campos = ['Bolo da Avó', 'farinha\ncenoura\nPão ralado', 'família'];
    expect(casaComBusca('bolo cenoura', campos)).toBe(true);
    expect(casaComBusca('pao avo', campos)).toBe(true);
    expect(casaComBusca('bolo chocolate', campos)).toBe(false);
    expect(casaComBusca('  ', campos)).toBe(true);
  });

  it('so links http(s)', () => {
    expect(urlSegura('https://receitas.pt/bolo')).toBe('https://receitas.pt/bolo');
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('receitas.pt')).toBeNull();
    expect(urlSegura('')).toBeNull();
  });
});

describe('ler uma receita de texto', () => {
  it('com os titulos habituais', () => {
    const r = lerReceita(`Bolo de Cenoura da Avó Maria

Rendimento: 12 fatias
Tempo de preparo: 50 minutos

Ingredientes
• 3 cenouras médias
• 4 ovos
• 1 chávena de óleo
• 2 chávenas de farinha de
trigo
• 1 colher de sopa de fermento

Modo de preparo
1. Bata no liquidificador as cenouras, os ovos e o óleo
até ficar homogéneo.
2. Junte a farinha e misture.
3. Leve ao forno a 180 °C.

Dica: fica melhor no dia seguinte.
1`);
    expect(r.title).toBe('Bolo de Cenoura da Avó Maria');
    expect(r.yield).toBe('12 fatias');
    expect(r.prepTime).toBe('50 minutos');
    expect(r.ingredients).toEqual([
      '3 cenouras médias',
      '4 ovos',
      '1 chávena de óleo',
      '2 chávenas de farinha de trigo',
      '1 colher de sopa de fermento',
    ]);
    expect(r.steps).toEqual([
      'Bata no liquidificador as cenouras, os ovos e o óleo até ficar homogéneo.',
      'Junte a farinha e misture.',
      'Leve ao forno a 180 °C.',
    ]);
    expect(r.notes).toBe('fica melhor no dia seguinte.');
    expect(r.avisos).toEqual([]);
  });

  it('"Preparação:" com o texto na mesma linha, e ingredientes sem marcadores', () => {
    const r = lerReceita(`Brigadeiro
Ingredientes:
1 lata de leite condensado
1 colher de manteiga
Preparação: Leve tudo ao lume brando, mexendo sempre, até descolar do fundo.`);
    expect(r.ingredients).toEqual(['1 lata de leite condensado', '1 colher de manteiga']);
    expect(r.steps).toEqual(['Leve tudo ao lume brando, mexendo sempre, até descolar do fundo.']);
  });

  it('sem titulos de seccao, avisa e tenta separar', () => {
    const r = lerReceita(`Mousse
- 200 g de chocolate
- 4 ovos
Derreta o chocolate. Junte as gemas. Bata as claras e envolva.`);
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.ingredients).toEqual(['200 g de chocolate', '4 ovos']);
    expect(r.steps[0]).toContain('Derreta');
  });

  it('sem texto nenhum (PDF digitalizado), avisa so isso', () => {
    const r = lerReceita('  \n\n 3 \n');
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/digitaliza/);
  });
});

describe('PDFs esquecidos', () => {
  const agora = new Date('2026-10-07T12:00:00Z');
  const ha = (horas: number) => new Date(agora.getTime() - horas * 3_600_000);

  it('so os sem receita, com mais de um dia, e do prefixo dos originais', () => {
    const r = orfaos(
      [
        { pathname: 'livro/originais/usado.pdf', uploadedAt: ha(100) },
        { pathname: 'livro/originais/esquecido.pdf', uploadedAt: ha(30) },
        { pathname: 'livro/originais/a-rever-agora.pdf', uploadedAt: ha(2) },
        { pathname: 'fotos/de-uma-ficha.jpg', uploadedAt: ha(500) },
      ],
      new Set(['livro/originais/usado.pdf']),
      agora,
    );
    expect(r).toEqual(['livro/originais/esquecido.pdf']);
  });
});

/** Um PDF minimo, de uma pagina, com estas linhas — gerado aqui para nao haver ficheiros binarios no repositorio. */
function pdfCom(linhasDeTexto: string[]): Uint8Array {
  const conteudo = [
    'BT /F1 12 Tf 50 750 Td 14 TL',
    ...linhasDeTexto.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`),
    'ET',
  ].join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe('PDF', () => {
  it('extrai o texto e le a receita', async () => {
    const texto = await textoDoPdf(
      pdfCom(['Tarte de Limao', 'Ingredientes', '- 3 limoes', '- 1 base de massa', 'Modo de preparo', '1. Misture tudo.']),
    );
    const r = lerReceita(texto);
    expect(r.title).toBe('Tarte de Limao');
    expect(r.ingredients).toEqual(['3 limoes', '1 base de massa']);
    expect(r.steps).toEqual(['Misture tudo.']);
  });
});
