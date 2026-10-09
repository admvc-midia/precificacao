/**
 * Criar a ficha tecnica a partir de uma receita do livro: as linhas revistas
 * viram composicao (com a unidade do insumo, nao a do browser), a ficha fica
 * ligada a receita, e so o dono o faz.
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

import { criarFichaDaReceita } from '@/lib/actions/livro';
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

async function receitaDoLivro(titulo: string) {
  return prisma.bookRecipe.create({
    data: {
      title: titulo,
      versions: {
        create: { number: 1, ingredients: '200 g de chocolate\n2 ovos', steps: 'Misturar.\n\nLevar ao forno.', authorName: 'Teste' },
      },
    },
  });
}

describe('criar a ficha a partir da receita', () => {
  it('cria a composicao revista e liga a ficha a receita', async () => {
    // Um insumo marcado (o do produto de teste: chocolate em kg).
    const outro = await produto(5);
    const item = await prisma.recipeItem.findFirstOrThrow({ where: { recipeId: outro.id, ingredientId: { not: null } } });
    const insumoId = item.ingredientId!;

    const titulo = nome('Bolo do livro');
    const r = await receitaDoLivro(titulo);
    const nomeFicha = nome('Ficha do livro');

    const campos = {
      id: r.id,
      name: nomeFicha,
      yieldQty: '16',
      'linha.0.incluir': 'on',
      'linha.0.original': '200 g de chocolate',
      'linha.0.ref': `ING:${insumoId}`,
      'linha.0.qty': '0,2',
      // Desmarcada: nao entra.
      'linha.1.original': '2 ovos',
      'linha.1.ref': '',
      'linha.1.qty': '',
    };

    // A cozinha nao.
    comoSe('KITCHEN');
    try {
      expect(await criarFichaDaReceita({ ok: true }, form(campos))).toEqual({ ok: false, message: 'Sem permissao para isto.' });
    } finally {
      comoSe('OWNER');
    }

    // Sem quantidade numa linha incluida: diz qual.
    const sem = await criarFichaDaReceita({ ok: true }, form({ ...campos, 'linha.0.qty': '' }));
    expect(sem.ok).toBe(false);
    expect(sem.message).toMatch(/Linha 1 \("200 g de chocolate"\)/);

    // Nome que ja existe: recusa.
    const repetido = await criarFichaDaReceita({ ok: true }, form({ ...campos, name: outro.name }));
    expect(repetido.message).toMatch(/Ja existe uma ficha/);

    await expect(criarFichaDaReceita({ ok: true }, form(campos))).rejects.toThrow(/^REDIRECT \/fichas\//);

    const ficha = await prisma.recipe.findUniqueOrThrow({ where: { name: nomeFicha }, include: { items: true } });
    expect(ficha.kind).toBe('PRODUCT');
    expect(Number(ficha.yieldQty)).toBe(16);
    expect(ficha.items).toHaveLength(1);
    expect(ficha.items[0]).toMatchObject({ ingredientId: insumoId, unit: 'KG', notes: '200 g de chocolate' });
    expect(Number(ficha.items[0].qty)).toBeCloseTo(0.2);
    expect((await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } })).fichaId).toBe(ficha.id);

    // Ja tem ficha: nao cria outra.
    const outra = await criarFichaDaReceita({ ok: true }, form({ ...campos, name: nome('Outra') }));
    expect(outra.message).toMatch(/ja tem ficha/);

    // A ligacao sai antes da limpeza apagar a ficha (a receita marcada vai na limpeza).
    await prisma.bookRecipe.update({ where: { id: r.id }, data: { fichaId: null } });
  });
});
