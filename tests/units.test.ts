import { describe, expect, it } from 'vitest';

import { formatMoney, formatPercent, parseDecimal, parsePercent } from '@/lib/money';
import {
  compareQuote,
  parseIngredientCsv,
  parsePriceCsv,
  quoteUnitCost,
} from '@/lib/providers';
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

describe('importacao de insumos em CSV', () => {
  const csv = [
    'nome;preco;quantidade;unidade;fornecedor;categoria;perda',
    'Carne picada 20%;12,50;5;KG;Talho do Bairro;alimento;0',
    'Alcatra;18,00;1;kg;Talho do Bairro;alimento;20',
    'Caixa de hamburguer;12,00;100;UN;Makro;embalagem;',
  ].join('\n');

  it('le nome, preco, quantidade e unidade', () => {
    const { rows, errors } = parseIngredientCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('Carne picada 20%');
    expect(rows[0].purchasePrice).toBeCloseTo(12.5, 10);
    expect(rows[0].purchaseQty).toBe(5);
    expect(rows[0].unit).toBe('KG');
  });

  it('converte a percentagem de perda em fator de correcao', () => {
    const { rows } = parseIngredientCsv(csv);
    expect(rows[0].correctionFactor).toBeCloseTo(1, 10);
    // 20% de perda = FC 1,25
    expect(rows[1].correctionFactor).toBeCloseTo(1.25, 10);
  });

  it('reconhece embalagens pela categoria', () => {
    const { rows } = parseIngredientCsv(csv);
    expect(rows[0].category).toBe('FOOD');
    expect(rows[2].category).toBe('PACKAGING');
  });

  it('guarda o nome do fornecedor', () => {
    const { rows } = parseIngredientCsv(csv);
    expect(rows[0].supplierName).toBe('Talho do Bairro');
    expect(rows[2].supplierName).toBe('Makro');
  });

  it('aceita cabecalho com acentos e maiusculas', () => {
    const { rows } = parseIngredientCsv('Nome;Preço;Quantidade\nSal;0,45;1');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Sal');
  });

  it('o fator de correcao explicito manda sobre a percentagem', () => {
    const { rows } = parseIngredientCsv(
      'nome;preco;quantidade;perda;fc\nAlcatra;18;1;50;1,25',
    );
    expect(rows[0].correctionFactor).toBeCloseTo(1.25, 10);
  });

  it('recusa a linha ma sem perder as boas', () => {
    const { rows, errors } = parseIngredientCsv(
      [
        'nome;preco;quantidade',
        'Bom;1,00;1',
        ';2,00;1',
        'SemPreco;;1',
        'Outro;3,00;2',
      ].join('\n'),
    );
    // Um ficheiro de 80 insumos nao pode ser rejeitado por causa de uma linha.
    expect(rows.map((r) => r.name)).toEqual(['Bom', 'Outro']);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(3);
    expect(errors[1].reason).toMatch(/preco invalido/);
  });

  it('exige as colunas obrigatorias', () => {
    expect(() => parseIngredientCsv('nome;preco\nSal;1')).toThrow(/quantidade/i);
  });

  it('ficheiro vazio nao rebenta', () => {
    expect(parseIngredientCsv('')).toEqual({ rows: [], errors: [] });
  });
});
