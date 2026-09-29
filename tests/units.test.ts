import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatPercent,
  parseDecimal,
  parsePercent,
  parseQty,
} from '@/lib/money';
import {
  compareQuote,
  parseIngredientCsv,
  parsePriceCsv,
  quoteUnitCost,
} from '@/lib/providers';
import {
  baseUnitOf,
  displayQtyValue,
  displayUnitOf,
  formatBaseQty,
  formatCostPerUnit,
  fromBase,
  fromDisplay,
  toBase,
  toDisplay,
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
    expect(displayUnitOf('G')).toBe('KG');
    expect(displayUnitOf('ML')).toBe('L');
    expect(displayUnitOf('UN')).toBe('UN');
  });

  it('recusa misturar familias', () => {
    expect(() => toBase(200, 'ML', 'G')).toThrow(UnitMismatchError);
    expect(() => toBase(200, 'UN', 'G')).toThrow(UnitMismatchError);
    expect(() => toBase(200, 'G', 'G')).not.toThrow();
  });

  it('mostra sempre na unidade de exibicao, nunca em gramas', () => {
    expect(formatBaseQty(1500, 'G')).toBe('1,5 kg');
    // O que antes escalava para "250 g" — a lista mudava de unidade conforme
    // o valor de cada linha, e duas linhas deixavam de se comparar.
    expect(formatBaseQty(250, 'G')).toBe('0,25 kg');
    expect(formatBaseQty(2000, 'ML')).toBe('2 L');
    expect(formatBaseQty(3, 'UN')).toBe('3 un');
  });

  it('nao arredonda uma pitada para zero', () => {
    // Meio grama de corante ainda tem de aparecer.
    expect(formatBaseQty(0.5, 'G')).toBe('0,0005 kg');
    expect(formatBaseQty(15, 'G')).toBe('0,015 kg');
  });

  it('converte nos dois sentidos entre a base e o que se ve', () => {
    expect(toDisplay(1500, 'G')).toBeCloseTo(1.5, 10);
    expect(fromDisplay(0.2, 'G')).toBeCloseTo(200, 10);
    // Os contaveis nao se convertem: 3 unidades sao 3 unidades.
    expect(toDisplay(3, 'UN')).toBe(3);
    expect(fromDisplay(3, 'UN')).toBe(3);
  });

  it('a ida e volta pelo campo de texto nao perde o valor', () => {
    for (const g of [15, 200, 1500, 0.5]) {
      expect(fromDisplay(Number(displayQtyValue(g, 'G')), 'G')).toBeCloseTo(g, 6);
    }
  });
});

describe('custo por unidade', () => {
  const eur = { currency: 'EUR', locale: 'pt-PT' };

  // O `Intl` separa o numero do simbolo com espaco nao-quebravel, e a versao
  // do ICU decide qual. Comparar com um espaco normal partia o teste sem nada
  // ter mudado no codigo.
  const limpo = (s: string) => s.replace(/[  ]/g, ' ');

  it('mostra por kg, nunca por grama', () => {
    // 1,69 EUR/kg guarda-se como 0,00169 por grama.
    expect(limpo(formatCostPerUnit(0.00169, 'G', eur))).toBe('1,69 €/kg');
    expect(limpo(formatCostPerUnit(0.0025, 'G', eur))).toBe('2,50 €/kg');
  });

  it('nao multiplica os contaveis', () => {
    // Um guardanapo a 1,50 cada cem: 0,015 por unidade, e nao 15.
    expect(limpo(formatCostPerUnit(0.015, 'UN', eur))).toBe('0,015 €/un');
  });

  it('cadastrar em g ou em kg da o mesmo custo por kg', () => {
    // 1,69 por um pacote de 1 kg, contra 1,69 por um pacote de 1000 g.
    const porKg = 1.69 / toBase(1, 'KG');
    const porG = 1.69 / toBase(1000, 'G');
    expect(porKg).toBeCloseTo(porG, 12);
    expect(formatCostPerUnit(porKg, 'G', eur)).toBe(
      formatCostPerUnit(porG, 'G', eur),
    );
  });

  it('nao explode com valores nao finitos', () => {
    expect(formatCostPerUnit(Number.NaN, 'G', eur)).toBe('—');
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
    expect(parseDecimal('1.234.567')).toBe(1234567);
    // Virgula a agrupar e ponto a decidir, como em ingles.
    expect(parseDecimal('1,234.56')).toBeCloseTo(1234.56, 10);
  });

  it('um grupo de milhar nunca comeca por zero', () => {
    // Isto aconteceu a serio: 0,200 kg de fermento entraram como 200 kg, e o
    // insumo passou a custar 0,01 EUR/kg em vez de 10,00.
    expect(parseDecimal('0.200')).toBeCloseTo(0.2, 10);
    expect(parseDecimal('0.395')).toBeCloseTo(0.395, 10);
    expect(parseDecimal('0.360')).toBeCloseTo(0.36, 10);
    expect(parseDecimal('0,200')).toBeCloseTo(0.2, 10);
    // E os casos que ja funcionavam continuam iguais.
    expect(parseDecimal('0.2')).toBeCloseTo(0.2, 10);
    expect(parseDecimal('0.25')).toBeCloseTo(0.25, 10);
  });

  it('numa quantidade o ponto e sempre decimal', () => {
    // Um quilo e meio, nao mil e quinhentos quilos. Ninguem escreve o tamanho
    // de uma embalagem com separador de milhar.
    expect(parseQty('1.500')).toBeCloseTo(1.5, 10);
    expect(parseQty('0.200')).toBeCloseTo(0.2, 10);
    expect(parseQty('12,5')).toBeCloseTo(12.5, 10);
    // Em dinheiro a leitura contraria e que faz sentido.
    expect(parseDecimal('1.500')).toBe(1500);
  });

  it('devolve zero para entrada vazia ou invalida', () => {
    expect(parseDecimal('')).toBe(0);
    expect(parseDecimal(null)).toBe(0);
    expect(parseDecimal('abc')).toBe(0);
    expect(parseQty('')).toBe(0);
    expect(parseQty(null)).toBe(0);
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

  it('le 0.200 como dois decimos, nao como duzentos', () => {
    // O mesmo engano do formulario: um CSV com a embalagem em "0.200" dava
    // 200 kg e o insumo ficava mil vezes mais barato.
    const { rows } = parseIngredientCsv(
      'nome;preco;quantidade;unidade\nFermento;2;0.200;KG',
    );
    expect(rows[0].purchaseQty).toBeCloseTo(0.2, 10);
  });

  it('ficheiro vazio nao rebenta', () => {
    expect(parseIngredientCsv('')).toEqual({ rows: [], errors: [] });
  });
});
