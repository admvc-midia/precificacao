import { describe, expect, it } from 'vitest';

import { MODELOS } from '@/generated/modelo';
import {
  confirmarSeparacao,
  lerCopia,
  NAO_SE_RESTAURAM,
  ordemDeInsercao,
  restauraveis,
} from '@/lib/exportar/restaurar';

function copia(tabelas: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ app: 'precificaragao', versao: '0.1.0', gravadoEm: '2026-10-06T10:00:00.000Z', tabelas, ...extra });
}

describe('ordem do restauro', () => {
  it('tem todas as tabelas menos contas, registo e tentativas, e sem ciclos', () => {
    const ordem = ordemDeInsercao();
    const todas = MODELOS.map((m) => m.name);
    expect(new Set(ordem)).toEqual(new Set(todas.filter((n) => !NAO_SE_RESTAURAM.includes(n))));
    expect(ordem).not.toContain('User');
    expect(ordem).not.toContain('AuditLog');
  });

  it('cada tabela entra depois das tabelas para onde aponta', () => {
    const ordem = ordemDeInsercao();
    const antes = (a: string, b: string) => expect(ordem.indexOf(a)).toBeLessThan(ordem.indexOf(b));
    antes('Supplier', 'Ingredient');
    antes('Ingredient', 'Recipe');
    antes('Recipe', 'RecipeItem');
    antes('Customer', 'CustomerOrder');
    antes('ProductionOrder', 'CustomerOrder');
    antes('CustomerOrder', 'CustomerOrderLine');
    antes('BookRecipe', 'BookRecipeVersion');
    antes('Cookbook', 'CookbookEntry');
  });

  it('nenhuma conta nem linha do registo aponta para uma tabela que se apaga', () => {
    expect(() => confirmarSeparacao()).not.toThrow();
  });
});

describe('lerCopia', () => {
  it('recusa o que nao e uma copia desta app', () => {
    expect(() => lerCopia('isto nao e json')).toThrow(/nao e uma copia/);
    expect(() => lerCopia(JSON.stringify({ app: 'outra', gravadoEm: '2026-10-06', tabelas: {} }))).toThrow(/nao e uma copia/);
    expect(() => lerCopia(copia({}, { gravadoEm: 'ontem' }))).toThrow(/nao e uma copia/);
    expect(() => lerCopia(copia({ Supplier: 'x' as unknown as unknown[] }))).toThrow(/nao e uma copia/);
  });

  it('tabela que ja nao existe: vazia passa, com dados recusa', () => {
    expect(() => lerCopia(copia({ SalesRecord: [] }))).not.toThrow();
    expect(() => lerCopia(copia({ SalesRecord: [{ id: 'a' }] }))).toThrow(/SalesRecord/);
  });

  it('tabela que a copia nao tem fica vazia; contas e registo nunca entram', () => {
    const c = lerCopia(copia({ User: [{ id: 'u', username: 'x' }], AuditLog: [{ id: 'a' }] }));
    expect(c.tabelas.Customer).toEqual([]);
    expect(c.tabelas.User).toBeUndefined();
    expect(c.tabelas.AuditLog).toBeUndefined();
    expect(Object.keys(c.tabelas).sort()).toEqual(restauraveis().map((m) => m.name).sort());
  });

  it('colunas que ja nao existem ficam de fora, com aviso', () => {
    const c = lerCopia(copia({ Supplier: [{ id: 's1', name: 'Makro', velho: 1, createdAt: '2026-01-01T00:00:00.000Z' }] }));
    expect(c.tabelas.Supplier[0]).toEqual({ id: 's1', name: 'Makro', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(c.avisos.join(' ')).toMatch(/Supplier: velho/);
  });

  it('falta uma coluna que hoje e obrigatoria: recusa', () => {
    expect(() => lerCopia(copia({ Supplier: [{ id: 's1' }] }))).toThrow(/falta "name" em Supplier/);
  });
});
