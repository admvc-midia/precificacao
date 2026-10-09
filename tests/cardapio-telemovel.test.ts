import { describe, expect, it } from 'vitest';

import { agrupar, etiquetasDe, resumoDoGrupo } from '@/components/cardapio/texto-cardapio';
import { garantiasDe, GARANTIAS_DE_ORIGEM } from '@/lib/cardapio/capa';
import { MODELO_DO_PDF } from '@/lib/cardapio/modelo';
import { guardarUltima, lerUltima, repetivel } from '@/lib/cardapio/pedido';
import { lerTexto, trechos } from '@/lib/cardapio/texto';

describe('a ultima escolha (so no telemovel)', () => {
  it('guarda so o que tem quantidade, e le-se de volta', () => {
    const t = guardarUltima({ a: 2, b: 0, c: 1 }, '2026-10-09');
    expect(lerUltima(t)).toEqual({ itens: { a: 2, c: 1 }, dia: '2026-10-09' });
  });
  it('qualquer coisa estranha conta como nada', () => {
    expect(lerUltima(null)).toBeNull();
    expect(lerUltima('isto nao e json')).toBeNull();
    expect(lerUltima(JSON.stringify({ itens: { a: -1, 'b c': 2, d: 1.5 }, dia: 'x' }))).toBeNull();
    expect(lerUltima(JSON.stringify({ itens: {}, dia: '2026-10-09' }))).toBeNull();
  });
  it('repetir deixa de fora o que ja nao se pode encomendar, e diz quantos', () => {
    const r = repetivel({ itens: { a: 2, b: 1, c: 3 }, dia: '2026-10-09' }, (id) => id !== 'b');
    expect(r).toEqual({ qtd: { a: 2, c: 3 }, foraDe: 1 });
  });
});

describe('textos fechados', () => {
  it('cada subtitulo vira uma secao que se abre; o que vem antes fica a vista', () => {
    const { antes, grupos } = agrupar(lerTexto('Texto de abertura.\n## Massa\n- Baunilha\n- Chocolate\n### Pedidos\nCom 2 dias.'));
    expect(antes).toHaveLength(1);
    expect(grupos.map((g) => g.titulo)).toEqual(['Massa', 'Pedidos']);
    expect(resumoDoGrupo(grupos[0].blocos)).toBe('2 opções');
  });
  it('a lista dos recheios ( | ) vira etiquetas e conta as opcoes', () => {
    const bolos = MODELO_DO_PDF.find((s) => s.name === 'Bolos')!;
    const { grupos } = agrupar(lerTexto(bolos.body));
    const recheios = grupos.find((g) => g.titulo === 'Recheios')!;
    expect(resumoDoGrupo(recheios.blocos)).toBe('18 opções');
    expect(recheios.aparte).toBe('(de 1 até 3 opções)');
  });
  it('uma frase com uma barra so nao vira etiquetas', () => {
    expect(etiquetasDe(trechos('Chocolate | Coco'))).toBeNull();
    expect(etiquetasDe(trechos('A | B | C'))).toEqual(['A', 'B', 'C']);
  });
});

describe('garantias da capa', () => {
  it('sem nada escrito, as de origem; escrito, uma por linha, no maximo 3', () => {
    expect(garantiasDe(null)).toEqual(GARANTIAS_DE_ORIGEM);
    expect(garantiasDe('Sem conservantes\n\n Feito à mão \nA\nB')).toEqual(['Sem conservantes', 'Feito à mão', 'A']);
    expect(garantiasDe('')).toEqual([]);
  });
});
