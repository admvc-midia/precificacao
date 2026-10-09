import { describe, expect, it } from 'vitest';

import {
  lerIngredientes,
  lerLinha,
  lerRendimento,
  maisParecido,
  quantidadeNaFicha,
} from '@/lib/livro/ingredientes';

const l = (s: string) => lerLinha(s)!;

describe('ler uma linha de ingredientes', () => {
  it('peso e volume', () => {
    expect(l('200 g de chocolate meio amargo')).toMatchObject({ qty: 200, unidade: 'G', nome: 'chocolate meio amargo' });
    expect(l('200g de Chocolate Belga')).toMatchObject({ qty: 200, unidade: 'G', nome: 'Chocolate Belga' });
    expect(l('1,5 kg de farinha')).toMatchObject({ qty: 1.5, unidade: 'KG', nome: 'farinha' });
    expect(l('500 ml de leite')).toMatchObject({ qty: 500, unidade: 'ML', nome: 'leite' });
    expect(l('1 litro de natas')).toMatchObject({ qty: 1, unidade: 'L', nome: 'natas' });
  });
  it('contagens e medidas de cozinha', () => {
    expect(l('3 ovos')).toMatchObject({ qty: 3, unidade: 'UN', medida: null, nome: 'ovos' });
    expect(l('1 lata de leite condensado')).toMatchObject({ qty: 1, unidade: null, medida: 'lata', nome: 'leite condensado' });
    expect(l('2 colheres de sopa de açúcar')).toMatchObject({ qty: 2, medida: 'colher de sopa', nome: 'açúcar' });
    expect(l('1/2 xícara de óleo')).toMatchObject({ qty: 0.5, medida: 'chávena', nome: 'óleo' });
    expect(l('1 1/2 chávena de farinha')).toMatchObject({ qty: 1.5, medida: 'chávena' });
    expect(l('½ colher de chá de fermento')).toMatchObject({ qty: 0.5, medida: 'colher de chá', nome: 'fermento' });
    expect(l('uma pitada de sal')).toMatchObject({ qty: 1, medida: 'pitada', nome: 'sal' });
  });
  it('quantidade no fim, marcadores e a gosto', () => {
    expect(l('- Chocolate em pó - 50 g')).toMatchObject({ qty: 50, unidade: 'G', nome: 'Chocolate em pó' });
    expect(l('• Leite condensado 1 lata')).toMatchObject({ qty: 1, medida: 'lata', nome: 'Leite condensado' });
    expect(l('Açúcar q.b.')).toMatchObject({ qty: null, aGosto: true, nome: 'Açúcar' });
    expect(l('Granulado a gosto')).toMatchObject({ qty: null, aGosto: true, nome: 'Granulado' });
  });
  it('titulos de grupo e linhas vazias', () => {
    expect(l('Recheio:')).toMatchObject({ titulo: true, nome: 'Recheio' });
    expect(lerLinha('   ')).toBeNull();
    expect(lerIngredientes('Massa:\n3 ovos\n\n200 g de açúcar')).toHaveLength(3);
  });
  it('rendimento', () => {
    expect(lerRendimento('Rende 16 fatias')).toBe(16);
    expect(lerRendimento('2 bolos de 20 cm')).toBe(2);
    expect(lerRendimento('')).toBeNull();
    expect(lerRendimento('muitas')).toBeNull();
  });
});

describe('o insumo mais parecido', () => {
  const cands = [
    { ref: 'ING:1', nome: 'Leite condensado Mococa' },
    { ref: 'ING:2', nome: 'Leite' },
    { ref: 'ING:3', nome: 'Chocolate meio amargo 50%' },
    { ref: 'ING:4', nome: 'Ovos M' },
    { ref: 'REC:5', nome: 'Brigadeiro branco (base)' },
  ];
  it('casa por palavras, sem acentos nem plurais', () => {
    expect(maisParecido('leite condensado', cands)?.ref).toBe('ING:1');
    expect(maisParecido('chocolate meio amargo', cands)?.ref).toBe('ING:3');
    expect(maisParecido('ovos', cands)?.ref).toBe('ING:4');
    expect(maisParecido('leite', cands)?.ref).toBe('ING:2');
    expect(maisParecido('Brigadeiro Branco', cands)?.ref).toBe('REC:5');
  });
  it('nada parecido: nada', () => {
    expect(maisParecido('farinha de trigo', cands)).toBeNull();
    expect(maisParecido('', cands)).toBeNull();
  });
});

describe('a quantidade na unidade da ficha', () => {
  it('peso e volume convertem; medidas de cozinha nunca', () => {
    expect(quantidadeNaFicha(l('200 g de chocolate'), 'G')).toEqual({ qty: 0.2, unit: 'KG' });
    expect(quantidadeNaFicha(l('500 ml de leite'), 'ML')).toEqual({ qty: 0.5, unit: 'L' });
    expect(quantidadeNaFicha(l('500 ml de leite'), 'G')).toMatchObject({ motivo: expect.stringMatching(/peso/) });
    expect(quantidadeNaFicha(l('1 lata de leite condensado'), 'G')).toMatchObject({ motivo: expect.stringMatching(/1 lata/) });
    expect(quantidadeNaFicha(l('2 colheres de sopa de açúcar'), 'G')).toHaveProperty('motivo');
  });
  it('por unidade: contagens e embalagens', () => {
    expect(quantidadeNaFicha(l('3 ovos'), 'UN')).toEqual({ qty: 3, unit: 'UN' });
    expect(quantidadeNaFicha(l('1 lata de leite condensado'), 'UN')).toEqual({ qty: 1, unit: 'UN' });
    expect(quantidadeNaFicha(l('200 g de chocolate'), 'UN')).toHaveProperty('motivo');
  });
  it('sem quantidade', () => {
    expect(quantidadeNaFicha(l('Açúcar q.b.'), 'G')).toMatchObject({ motivo: expect.stringMatching(/q\.b\./) });
  });
});
