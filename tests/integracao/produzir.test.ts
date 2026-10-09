/**
 * "Produzir" a partir de uma ficha (botao da ficha tecnica e do livro de
 * receitas): dono e cozinha criam a ordem; leitura e marketing nao; uma
 * preparacao base nao se produz sozinha.
 *
 * As ordens que nascem daqui tem o nome da ficha marcada (ZZTEMP-...), e a
 * limpeza apanha-as pelas linhas.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { produzirFicha } from '@/lib/actions/production';
import { saveRecipe } from '@/lib/actions/recipes';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  nome,
  prisma,
  reporSettings,
  retrato,
  type Retrato,
} from './base';
import { produto } from './ajudas';
import { comoSe } from './sessao-falsa';

let antes: Retrato;

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
});

afterAll(async () => {
  comoSe('OWNER');
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

describe('produzir a partir de uma ficha', () => {
  it('a cozinha cria a ordem com o produto e e levada para ela', async () => {
    const bolo = await produto(5);
    comoSe('KITCHEN');
    try {
      await expect(
        produzirFicha({ ok: true }, form({ recipeId: bolo.id, qty: '12', dueAt: '2026-10-17', notes: 'Feira' })),
      ).rejects.toThrow(/^REDIRECT \/producao\//);
    } finally {
      comoSe('OWNER');
    }
    const ordem = await prisma.productionOrder.findFirstOrThrow({
      where: { lines: { some: { recipeId: bolo.id } } },
      include: { lines: true },
    });
    expect(ordem.name).toBe(`${bolo.name} · 17/10`);
    expect(ordem.dueAt?.toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(ordem.notes).toBe('Feira');
    expect(ordem.lines).toHaveLength(1);
    expect(Number(ordem.lines[0].qty)).toBe(12);
  });

  it('leitura e marketing nao; quantidade e tipo de ficha conferidos', async () => {
    const bolo = await produto(5);
    for (const perfil of ['READER', 'MARKETING'] as const) {
      comoSe(perfil);
      try {
        const r = await produzirFicha({ ok: true }, form({ recipeId: bolo.id, qty: '1' }));
        expect(r, perfil).toEqual({ ok: false, message: 'Sem permissao para isto.' });
      } finally {
        comoSe('OWNER');
      }
    }

    const zero = await produzirFicha({ ok: true }, form({ recipeId: bolo.id, qty: '0' }));
    expect(zero.ok).toBe(false);

    const nomeBase = nome('Massa');
    const rb = await saveRecipe({ ok: true }, form({ name: nomeBase, kind: 'BASE', yieldQty: '1', yieldUnit: 'G' }));
    expect(rb.ok, rb.message).toBe(true);
    const base = await prisma.recipe.findFirstOrThrow({ where: { name: nomeBase } });
    const r = await produzirFicha({ ok: true }, form({ recipeId: base.id, qty: '1' }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/produtos finais/);
    expect(await prisma.productionOrder.count({ where: { lines: { some: { recipeId: { in: [bolo.id, base.id] } } } } })).toBe(0);
  });

});
