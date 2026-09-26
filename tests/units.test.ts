import { describe, expect, it } from 'vitest';

import { formatMoney, formatPercent, parseDecimal, parsePercent } from '@/lib/money';
import { parsePriceCsv, quoteUnitCost, compareQuote } from '@/lib/providers';
import {
  baseUnitOf,
  compatibleUnits,
  formatBaseQty,
  fromBase,
  toBase,
  UnitMismatchError,
} from '@/lib/units';

describe('conversao de unidades', () => {
  it('converte para a unidade base', () => {
    expect(toBase(5, 'KG')).toBe(5000);
    expect(toBase(1, 'L')).toBe(1000);
    expect(toBase(250, 'G')).toBe(250);
    expect(toBase(3, 'UN')).toBe(3);
  });

  it('volta da unidade base', () => {
    expect(fromBase(5000, 'KG')).toBe(5);
    expect(fromBase(1500, 'L')).toBe(1.5);
  });

  it('mapeia cada unidade de compra para a sua familia', () => {
    expect(baseUnitOf('KG')).toBe('G');
    expect(baseUnitOf('ML')).toBe('ML');
    expect(baseUnitOf('UN')).toBe('UN');
    expect(compatibleUnits('G')).toEqual(['KG', 'G']);
    expect(compatibleUnits('ML')).toEqual(['L', 'ML']);
  });

  it('recusa misturar familias', () => {
    expect(() => toBase(200, 'ML', 'G')).toThrow(UnitMismatchError);
    expect(() => toBase(200, 'UN', 'G')).toThrow(UnitMismatchError);
    expect(() => toBase(200, 'G', 'G')).not.toThrow();
  });

  it('escolhe a escala legivel na formatacao', () => {
    expect(formatBaseQty(1500, 'G')).toContain('kg');
    expect(formatBaseQty(250, 'G')).toContain('g');
    expect(formatBaseQty(2000, 'ML')).toContain('L');
  });
});

describe('leitura de numeros digitados', () => {
  it('aceita virgula e ponto decimal', () => {
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('12.50')).toBe(12.5);
    expect(parseDecimal(12.5)).toBe(12.5);
  });

  it('ignora simbolo de moeda e espacos', () => {
    expect(parseDecimal(' 12,50 € ')).toBe(12.5);
    expect(parseDecimal('R$ 1.234,56')).toBeCloseTo(1234.56, 10);
  });

  it('trata separador de milhar sem confundir com decimal', () => {
    expect(parseDecimal('1.234,56')).toBeCloseTo(1234.56, 10);
    expect(parseDecimal('1.234')).toBe(1234);
    // Tres casas depois do ponto so podem ser milhar; duas sao decimais.
    expect(parseDecimal('1.23')).toBeCloseTo(1.23, 10);
  });

  it('devolve zero para entrada vazia ou invalida', () => {
    expect(parseDecimal('')).toBe(0);
    expect(parseDecimal(null)).toBe(0);
    expect(parseDecimal('abc')).toBe(0);
  });

  it('le percentagem como fracao', () => {
    expect(parsePercent('30')).toBeCloseTo(0.3, 10);
    expect(parsePercent('30%')).toBeCloseTo(0.3, 10);
    expect(parsePercent('12,5')).toBeCloseTo(0.125, 10);
  });
});

describe('formatacao', () => {
  it('formata na moeda configurada', () => {
    const eur = formatMoney(12.5, { currency: 'EUR', locale: 'pt-PT' });
    expect(eur).toContain('12,50');
    expect(eur).toContain('€');

    const brl = formatMoney(12.5, { currency: 'BRL', locale: 'pt-BR' });
    expect(brl).toContain('12,50');
    expect(brl).toContain('R$');
  });

  it('nao explode com valores nao finitos', () => {
    expect(formatMoney(Number.NaN, { currency: 'EUR', locale: 'pt-PT' })).toBe('—');
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('importacao de precos em CSV', () => {
  const csv = [
    'nome;preco;quantidade;unidade;fonte',
    'Carne picada 20%;12,50;5;KG;Continente',
    'Oleo de girassol;2,00;1;L;Pingo Doce',
    'Pao de hamburguer;3,60;24;UN;Auchan',
  ].join('\n');

  it('le o formato com ponto e virgula e virgula decimal', () => {
    const rows = parsePriceCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].price).toBeCloseTo(12.5, 10);
    expect(rows[0].qty).toBe(5);
    expect(rows[0].unit).toBe('KG');
    expect(rows[0].source).toBe('CONTINENTE');
    expect(rows[1].source).toBe('PINGO_DOCE');
    expect(rows[2].source).toBe('AUCHAN');
  });

  it('le tambem o formato separado por virgula', () => {
    const rows = parsePriceCsv('nome,preco,quantidade,unidade\nSal,0.45,1,KG');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBeCloseTo(0.45, 10);
  });

  it('exige as colunas obrigatorias', () => {
    expect(() => parsePriceCsv('qualquer;coisa\na;b')).toThrow(/nome/i);
  });

  it('ignora linhas sem preco valido', () => {
    const rows = parsePriceCsv('nome;preco\nBom;1,00\nMau;\nOutro;0');
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Bom');
  });

  it('normaliza pela unidade base para comparar embalagens diferentes', () => {
    const [carne] = parsePriceCsv(csv);
    // 12,50 por 5 kg = 0,0025 por grama.
    expect(quoteUnitCost(carne)).toBeCloseTo(0.0025, 10);

    // Contra um insumo que hoje custa 0,0020/g, a cotacao esta 25% mais cara.
    const cmp = compareQuote(carne, 0.002);
    expect(cmp.delta).toBeCloseTo(0.25, 10);
    expect(cmp.cheaper).toBe(false);
  });
});
