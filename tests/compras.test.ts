import { describe, expect, it } from 'vitest';

import { botoes, pagina } from '@/lib/paginacao';
import {
  compararPreco,
  embalagensParaMinimo,
  entradasDaCompra,
  lerEstoque,
  precoPorBase,
} from '@/lib/pricing/compras';
import { formatCostPerUnit, formatBaseQty } from '@/lib/units';
import { formatUnitCost } from '@/lib/money';

describe('paginacao', () => {
  it('fatia e rotulo', () => {
    const p = pagina(57, 20, 2);
    expect(p).toMatchObject({ atual: 2, total: 3, inicio: 20, fim: 40, rotulo: '21–40 de 57' });
    expect(pagina(57, 20, 3)).toMatchObject({ inicio: 40, fim: 57 });
  });

  it('sem rotulo quando cabe tudo numa pagina', () => {
    expect(pagina(12, 20, 1)).toMatchObject({ total: 1, rotulo: '' });
    expect(pagina(0, 20, 1)).toMatchObject({ total: 1, inicio: 0, fim: 0 });
  });

  it('uma pagina que deixou de existir cai na ultima; lixo cai na primeira', () => {
    expect(pagina(25, 20, 9).atual).toBe(2);
    expect(pagina(25, 20, Number.NaN).atual).toBe(1);
    expect(pagina(25, 20, -3).atual).toBe(1);
  });

  it('nunca mais de 7 botoes, com reticencias', () => {
    expect(botoes(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(botoes(1, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
    expect(botoes(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(botoes(12, 12)).toEqual([1, null, 8, 9, 10, 11, 12]);
    for (let a = 1; a <= 30; a++) expect(botoes(a, 30).length).toBeLessThanOrEqual(7);
  });
});

describe('preco por base e comparacao', () => {
  it('preco por grama de uma embalagem', () => {
    expect(precoPorBase({ price: 3.45, packQty: 0.5, packUnit: 'KG' })).toBeCloseTo(0.0069);
    expect(precoPorBase({ price: 3, packQty: 0, packUnit: 'KG' })).toBeNull();
  });

  it('mais barato, mais caro, igual e sem referencia', () => {
    const ref = 6.9 / 1000; // 6,90 EUR/kg
    const barato = compararPreco({ price: 5.9, packQty: 1, packUnit: 'KG' }, ref)!;
    expect(barato.veredicto).toBe('mais-barato');
    expect(barato.diferenca).toBeCloseTo(-0.1449, 3);

    expect(compararPreco({ price: 7.5, packQty: 1, packUnit: 'KG' }, ref)!.veredicto).toBe('mais-caro');
    // 0,5% de diferenca: arredondamento de etiqueta, conta como igual.
    expect(compararPreco({ price: 6.93, packQty: 1, packUnit: 'KG' }, ref)!.veredicto).toBe('igual');
    expect(compararPreco({ price: 5, packQty: 1, packUnit: 'KG' }, null)!.veredicto).toBe('sem-referencia');
  });

  it('compara embalagens de tamanhos diferentes pelo preco por kg', () => {
    // 2,50 por 250 g = 10 EUR/kg, contra 6,90 EUR/kg: mais caro, mesmo sendo
    // o numero mais pequeno na etiqueta.
    const c = compararPreco({ price: 2.5, packQty: 250, packUnit: 'G' }, 6.9 / 1000)!;
    expect(c.veredicto).toBe('mais-caro');
  });
});

describe('estoque', () => {
  it('situacao e dias de cobertura', () => {
    expect(lerEstoque({ stockBase: 0, minStockBase: 500, gastoPorDia: 10 }).situacao).toBe('sem-estoque');
    expect(lerEstoque({ stockBase: 400, minStockBase: 500, gastoPorDia: 10 })).toEqual({
      situacao: 'abaixo-do-minimo',
      dias: 40,
    });
    expect(lerEstoque({ stockBase: 900, minStockBase: null, gastoPorDia: 0 })).toEqual({
      situacao: 'ok',
      dias: null,
    });
  });

  it('embalagens para chegar ao minimo, sempre inteiras', () => {
    expect(embalagensParaMinimo(200, 1000, { packQty: 0.5, packUnit: 'KG' })).toBe(2);
    expect(embalagensParaMinimo(200, 1001, { packQty: 0.5, packUnit: 'KG' })).toBe(2);
    expect(embalagensParaMinimo(0, 1500, { packQty: 1, packUnit: 'KG' })).toBe(2);
    expect(embalagensParaMinimo(1200, 1000, { packQty: 1, packUnit: 'KG' })).toBe(0);
    expect(embalagensParaMinimo(0, null, { packQty: 1, packUnit: 'KG' })).toBe(0);
    // Estoque negativo (saidas sem entradas registadas) conta como zero.
    expect(embalagensParaMinimo(-300, 1000, { packQty: 1, packUnit: 'KG' })).toBe(1);
  });
});

describe('entradas ao fechar', () => {
  it('ao preco pago, uma por item', () => {
    const e = entradasDaCompra(
      [
        { ingredientId: 'a', ingredientName: 'Queijo', baseUnit: 'G', packs: 2, price: 5.9, packQty: 1, packUnit: 'KG' },
        { ingredientId: 'b', ingredientName: 'Ovos', baseUnit: 'UN', packs: 1, price: 3, packQty: 12, packUnit: 'UN' },
        { ingredientId: 'c', ingredientName: 'Zero', baseUnit: 'G', packs: 0, price: 1, packQty: 1, packUnit: 'KG' },
      ],
      'Makro',
    );
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ ingredientId: 'a', qtyBase: 2000 });
    expect(e[0].unitCost).toBeCloseTo(0.0059);
    expect(e[0].note).toContain('Makro');
    expect(e[1]).toMatchObject({ qtyBase: 12, unitCost: 0.25 });
  });

  it('recusa unidade de outra familia', () => {
    expect(() =>
      entradasDaCompra(
        [{ ingredientId: 'a', ingredientName: 'Leite', baseUnit: 'G', packs: 1, price: 1, packQty: 1, packUnit: 'L' }],
        'x',
      ),
    ).toThrow();
  });
});

describe('casas decimais', () => {
  const cfg = { currency: 'EUR', locale: 'pt-PT' };

  it('automatico mantem ate 4 casas', () => {
    expect(formatBaseQty(395, 'G', cfg)).toBe('0,395 kg');
    expect(formatBaseQty(395, 'G', 'pt-PT')).toBe('0,395 kg');
  });

  it('2 casas arredonda, e o muito pequeno nao vira zero', () => {
    const dois = { ...cfg, decimals: 2 };
    expect(formatBaseQty(395, 'G', dois)).toBe('0,40 kg');
    expect(formatBaseQty(15, 'G', dois)).toBe('0,02 kg');
    expect(formatBaseQty(3, 'G', dois)).toBe('< 0,01 kg');
    expect(formatBaseQty(0, 'G', dois)).toBe('0,00 kg');
    expect(formatBaseQty(3, 'UN', dois)).toBe('3 un');
    expect(formatBaseQty(-3, 'G', dois)).toBe('-< 0,01 kg');
  });

  it('custo por kg e custo unitario respeitam as 2 casas', () => {
    const v = 1.6875 / 1000;
    expect(formatCostPerUnit(v, 'G', cfg)).toMatch(/1,6875/);
    expect(formatCostPerUnit(v, 'G', { ...cfg, decimals: 2 })).toMatch(/1,69/);
    expect(formatUnitCost(0.01234, { ...cfg, decimals: 2 })).toMatch(/0,01/);
  });
});
