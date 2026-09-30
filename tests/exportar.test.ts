import { describe, expect, it } from 'vitest';

import { BOM, celulaCsv, dataCsv, montarCsv, numeroCsv } from '@/lib/exportar/csv';
import { dataDoFicheiro, eLista, LISTAS, nomeDoFicheiro } from '@/lib/exportar/listas';

describe('numeros no CSV', () => {
  it('usa virgula decimal e nunca separador de milhares', () => {
    expect(numeroCsv(1250.5)).toBe('1250,5');
    expect(numeroCsv(0.2)).toBe('0,2');
    expect(numeroCsv(3)).toBe('3');
    expect(numeroCsv(-4.75)).toBe('-4,75');
  });

  it('limpa o ruido da virgula flutuante', () => {
    expect(numeroCsv(0.1 + 0.2)).toBe('0,3');
  });

  it('deixa vazio o que nao e numero', () => {
    expect(numeroCsv(Number.NaN)).toBe('');
    expect(numeroCsv(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('celulas', () => {
  it('nulo e indefinido ficam vazios; booleano vira Sim/Nao', () => {
    expect(celulaCsv(null)).toBe('');
    expect(celulaCsv(undefined)).toBe('');
    expect(celulaCsv(true)).toBe('Sim');
    expect(celulaCsv(false)).toBe('Nao');
  });

  it('poe aspas quando o texto tem ; aspas ou quebra de linha', () => {
    expect(celulaCsv('Farinha; tipo 55')).toBe('"Farinha; tipo 55"');
    expect(celulaCsv('Queijo "da serra"')).toBe('"Queijo ""da serra"""');
    expect(celulaCsv('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(celulaCsv('Acucar, branco')).toBe('Acucar, branco');
  });

  it('texto que comeca como formula nao vira formula no Excel', () => {
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv('+351 912')).toBe("'+351 912");
    expect(celulaCsv('-desconto')).toBe("'-desconto");
    expect(celulaCsv('@loja')).toBe("'@loja");
  });

  it('um numero negativo continua numero', () => {
    expect(celulaCsv(-2)).toBe('-2');
  });

  it('datas na hora de Lisboa, dia/mes/ano', () => {
    // 30/09 as 23h30 UTC ja e 1 de outubro em Lisboa (verao, UTC+1).
    expect(dataCsv(new Date('2026-09-30T23:30:00Z'))).toBe('01/10/2026 00:30');
    expect(dataCsv(new Date('2026-01-15T09:05:00Z'))).toBe('15/01/2026 09:05');
  });
});

describe('montarCsv', () => {
  it('BOM no inicio, ; entre colunas, CRLF entre linhas', () => {
    const csv = montarCsv(['Insumo', 'Preco'], [['Leite', 0.89], ['Ovos', null]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Insumo;Preco\r\nLeite;0,89\r\nOvos;\r\n');
  });
});

describe('listas', () => {
  it('conhece so as listas declaradas', () => {
    expect(eLista('insumos')).toBe(true);
    expect(eLista('copia')).toBe(false);
    expect(eLista('../etc')).toBe(false);
  });

  it('ids sem repetir', () => {
    const ids = LISTAS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nome do ficheiro com a data de Lisboa', () => {
    const d = new Date('2026-09-30T23:30:00Z');
    expect(dataDoFicheiro(d)).toBe('2026-10-01');
    expect(nomeDoFicheiro('insumos', 'csv', d)).toBe('precificacao-insumos-2026-10-01.csv');
  });
});
