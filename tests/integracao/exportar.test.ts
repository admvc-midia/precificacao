/**
 * Exportacao contra a base a serio. So le — o unico dado criado e um insumo
 * marcado, apagado no fim como nos outros ficheiros.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { saveIngredient } from '@/lib/actions/ingredients';
import { copiaCompleta, gerarLista, tabelasDoSchema } from '@/lib/exportar/gerar';
import { LISTAS } from '@/lib/exportar/listas';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  nome,
  prisma,
  retrato,
  reporSettings,
  type Retrato,
} from './base';

let antes: Retrato;

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
});

afterAll(async () => {
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

describe('copia completa', () => {
  it('traz todas as tabelas do schema, incluindo as despesas', async () => {
    const copia = await copiaCompleta();
    const tabelas = Object.keys(copia.tabelas).sort();
    expect(tabelas).toEqual(tabelasDoSchema().sort());
    expect(tabelas).toContain('Expense');
    expect(copia.contagem.Ingredient).toBe(await prisma.ingredient.count());
  });

  it('guarda os decimais como texto, sem perder casas', async () => {
    const copia = await copiaCompleta();
    const json = JSON.parse(JSON.stringify(copia));
    const insumo = json.tabelas.Ingredient[0];
    if (insumo) expect(typeof insumo.purchasePrice).toBe('string');
  });
});

describe('listas em CSV', () => {
  it('todas as listas geram, com cabecalho', async () => {
    for (const l of LISTAS) {
      const csv = await gerarLista(l.id);
      expect(csv.split('\r\n')[0].length, l.id).toBeGreaterThan(5);
    }
  });

  it('um insumo sai em kg, com virgula decimal e preco por kg', async () => {
    const n = nome('Queijo');
    const r = await saveIngredient(
      { ok: true },
      form({
        name: n,
        category: 'FOOD',
        purchaseUnit: 'G',
        purchaseQty: '500',
        purchasePrice: '3,45',
        correctionFactor: '1',
        confirmDuplicate: '1',
        stockBase: '1,5',
        minStockBase: '0,8',
      }),
    );
    expect(r.ok, r.message).toBe(true);

    const csv = await gerarLista('insumos');
    const linha = csv.split('\r\n').find((l) => l.startsWith(n));
    expect(linha).toBeDefined();
    const c = linha!.split(';');
    expect(c[1]).toBe('Alimento');
    expect(c[3]).toBe('3,45'); // preco da embalagem
    expect(c[4]).toBe('500'); // embalagem
    expect(c[5]).toBe('g');
    expect(c[6]).toBe('6,9'); // por kg
    expect(c[10]).toBe('kg');
  });
});
