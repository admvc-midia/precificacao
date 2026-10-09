/**
 * Fotos das fichas contra a base a serio, com o Blob **simulado**: os testes
 * nao escrevem no store do utilizador. O que se confere e a base e as ordens
 * dadas ao Blob — gravar privado, apagar a antiga, nunca deixar orfaos.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const blob = vi.hoisted(() => ({
  gravados: [] as { pathname: string; access: string }[],
  apagados: [] as string[],
  n: 0,
}));
vi.mock('@vercel/blob', () => ({
  put: async (pathname: string, _body: unknown, opts: { access: string }) => {
    const final = pathname.replace(/(\.\w+)$/, `-sufixo${++blob.n}$1`);
    blob.gravados.push({ pathname: final, access: opts.access });
    return { pathname: final, url: `https://x.private.blob.vercel-storage.com/${final}` };
  },
  del: async (caminhos: string[] | string) => {
    blob.apagados.push(...(Array.isArray(caminhos) ? caminhos : [caminhos]));
  },
  get: async () => null,
}));

import { removeRecipePhoto, saveRecipePhoto } from '@/lib/actions/photos';
import { apagarReceita, guardarFotoReceita, tirarFotoReceita } from '@/lib/actions/livro';
import { deleteRecipe, saveRecipe } from '@/lib/actions/recipes';
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
import { comoSe } from './sessao-falsa';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);
let antes: Retrato;
const tokenAntes = process.env.BLOB_READ_WRITE_TOKEN;

beforeAll(async () => {
  exigirSchemaCerto();
  // So para `blobConfigurado()` dizer que sim; o Blob e simulado.
  process.env.BLOB_READ_WRITE_TOKEN = 'teste';
  antes = await retrato();
  await limpar();
});

afterAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = tokenAntes;
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

beforeEach(() => {
  blob.gravados.length = 0;
  blob.apagados.length = 0;
});

async function ficha() {
  const n = nome('Bolo');
  const r = await saveRecipe({ ok: true }, form({ name: n, kind: 'PRODUCT', yieldQty: '1' }));
  expect(r.ok, r.message).toBe(true);
  return prisma.recipe.findFirstOrThrow({ where: { name: n } });
}

function comFotos(id: string, foto: BlobPart = JPEG) {
  const f = new FormData();
  f.set('id', id);
  f.set('foto', new Blob([foto], { type: 'image/jpeg' }), 'foto.jpg');
  f.set('mini', new Blob([JPEG], { type: 'image/jpeg' }), 'mini.jpg');
  return f;
}

describe('foto da ficha', () => {
  it('grava a foto e a miniatura como privadas e aponta a ficha para elas', async () => {
    const f = await ficha();
    const r = await saveRecipePhoto({ ok: true }, comFotos(f.id));
    expect(r.ok, r.message).toBe(true);

    expect(blob.gravados).toHaveLength(2);
    expect(blob.gravados.every((g) => g.access === 'private')).toBe(true);
    const depois = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });
    expect(depois.photoPath).toMatch(new RegExp(`^fotos/${f.id}-sufixo\\d+\\.jpg$`));
    expect(depois.photoThumbPath).toMatch(/-mini-sufixo\d+\.jpg$/);
    expect(blob.apagados).toHaveLength(0);
  });

  it('trocar apaga as antigas, e so depois de a ficha apontar para as novas', async () => {
    const f = await ficha();
    await saveRecipePhoto({ ok: true }, comFotos(f.id));
    const primeira = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });
    blob.apagados.length = 0;

    const r = await saveRecipePhoto({ ok: true }, comFotos(f.id));
    expect(r.message).toMatch(/trocada/);
    const segunda = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });
    expect(segunda.photoPath).not.toBe(primeira.photoPath);
    expect(blob.apagados.sort()).toEqual([primeira.photoPath, primeira.photoThumbPath].sort());
  });

  it('recusa o que nao e imagem, sem gravar nada', async () => {
    const f = await ficha();
    const r = await saveRecipePhoto({ ok: true }, comFotos(f.id, 'isto nao e jpeg'));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/nao e uma imagem/);
    expect(blob.gravados).toHaveLength(0);
    const depois = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });
    expect(depois.photoPath).toBeNull();
  });

  it('sem token configurado, diz o que falta', async () => {
    const f = await ficha();
    process.env.BLOB_READ_WRITE_TOKEN = '';
    try {
      const r = await saveRecipePhoto({ ok: true }, comFotos(f.id));
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/BLOB_READ_WRITE_TOKEN/);
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = 'teste';
    }
  });

  it('remover limpa a ficha e apaga do Blob', async () => {
    const f = await ficha();
    await saveRecipePhoto({ ok: true }, comFotos(f.id));
    const com = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });

    const r = await removeRecipePhoto({ ok: true }, form({ id: f.id }));
    expect(r.ok, r.message).toBe(true);
    const sem = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });
    expect(sem.photoPath).toBeNull();
    expect(sem.photoThumbPath).toBeNull();
    expect(blob.apagados).toEqual(expect.arrayContaining([com.photoPath, com.photoThumbPath]));
  });

  it('apagar a ficha apaga as fotos', async () => {
    const f = await ficha();
    await saveRecipePhoto({ ok: true }, comFotos(f.id));
    const com = await prisma.recipe.findUniqueOrThrow({ where: { id: f.id } });

    const r = await deleteRecipe({ ok: true }, form({ id: f.id }));
    expect(r.ok, r.message).toBe(true);
    expect(blob.apagados).toEqual(expect.arrayContaining([com.photoPath, com.photoThumbPath]));
  });
});

describe('foto da receita do livro', () => {
  async function receita() {
    return prisma.bookRecipe.create({
      data: {
        title: nome('Receita'),
        versions: { create: { number: 1, ingredients: 'farinha', steps: 'misturar', authorName: 'Teste' } },
      },
    });
  }

  it('grava na pasta do livro, troca apagando a antiga, e tira', async () => {
    comoSe('KITCHEN');
    const r = await receita();
    const g = await guardarFotoReceita({ ok: true }, comFotos(r.id));
    expect(g.ok, g.message).toBe(true);
    const com = await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } });
    expect(com.photoPath).toMatch(new RegExp(`^livro/fotos/${r.id}-sufixo\\d+\\.jpg$`));
    expect(blob.gravados.every((x) => x.access === 'private')).toBe(true);

    blob.apagados.length = 0;
    await guardarFotoReceita({ ok: true }, comFotos(r.id));
    expect(blob.apagados.sort()).toEqual([com.photoPath, com.photoThumbPath].sort());

    const t = await tirarFotoReceita({ ok: true }, form({ id: r.id }));
    expect(t.ok, t.message).toBe(true);
    expect((await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } })).photoPath).toBeNull();
    comoSe('OWNER');
  });

  it('a leitura nao poe fotos', async () => {
    const r = await receita();
    comoSe('READER');
    try {
      const g = await guardarFotoReceita({ ok: true }, comFotos(r.id));
      expect(g.ok).toBe(false);
      expect(blob.gravados).toHaveLength(0);
    } finally {
      comoSe('OWNER');
    }
  });

  it('apagar a receita apaga as fotos', async () => {
    const r = await receita();
    await guardarFotoReceita({ ok: true }, comFotos(r.id));
    const com = await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } });
    blob.apagados.length = 0;
    await expect(apagarReceita({ ok: true }, form({ id: r.id }))).rejects.toThrow(/^REDIRECT/);
    expect(blob.apagados).toEqual(expect.arrayContaining([com.photoPath, com.photoThumbPath]));
  });
});