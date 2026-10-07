/**
 * Livro de receitas contra a base a serio: versoes, permissoes, livros.
 *
 * O que mais importa provar: a versao original nunca muda, cada alteracao
 * fica com o autor, e cada perfil so faz o que pode.
 *
 * As actions leem a pessoa de `lib/sessao`, aqui trocada por `comoSe(...)`
 * (ver `sessao-falsa.ts`). As contas usadas sao reais e marcadas, porque a
 * versao guarda o autor com chave estrangeira.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import {
  alterarDadosReceita,
  apagarReceita,
  arquivarReceita,
  criarLivro,
  criarReceita,
  importarReceita,
  juntarAoLivro,
  moverEntrada,
  novaVersao,
  tirarDoLivro,
  usarVersao,
} from '@/lib/actions/livro';
import { saveRecipe } from '@/lib/actions/recipes';
import { detalheLivro, listarReceitas } from '@/lib/livro/consultas';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  MARCA,
  nome,
  prisma,
  retrato,
  reporSettings,
  type Retrato,
} from './base';
import { comoSe } from './sessao-falsa';

let antes: Retrato;
let cozinha: { id: string; name: string };
let dono: { id: string; name: string };

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
  const conta = (role: 'OWNER' | 'KITCHEN', n: string) =>
    prisma.user.create({
      data: { username: nome(n).toLowerCase(), name: n, role, passwordHash: 'x' },
    });
  cozinha = await conta('KITCHEN', 'Ana Cozinha');
  dono = await conta('OWNER', 'Dono Teste');
});

afterEach(() => comoSe('OWNER', dono?.id, dono?.name));

afterAll(async () => {
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

const RECEITA = {
  ingredients: '3 ovos\n200 g de açúcar\n2 cenouras',
  steps: 'Bata os ovos.\n\nJunte o resto.',
  yield: '12 fatias',
};

/** Cria uma receita como a cozinha e devolve-a com as versoes. */
async function receita(extra: Record<string, string> = {}) {
  comoSe('KITCHEN', cozinha.id, cozinha.name);
  const titulo = nome('Bolo');
  await expect(
    criarReceita({ ok: true }, form({ title: titulo, sourceKind: 'FAMILY', sourceName: 'Avó Maria', ...RECEITA, ...extra })),
  ).rejects.toThrow(/^REDIRECT \/receitas\//);
  return prisma.bookRecipe.findFirstOrThrow({
    where: { title: titulo },
    include: { versions: { orderBy: { number: 'asc' } } },
  });
}

describe('versoes', () => {
  it('a criacao e a versao 1, com o autor', async () => {
    const r = await receita();
    expect(r.currentVersion).toBe(1);
    expect(r.versions).toHaveLength(1);
    expect(r.versions[0]).toMatchObject({ number: 1, authorId: cozinha.id, authorName: 'Ana Cozinha' });
    expect(r.versions[0].ingredients).toBe(RECEITA.ingredients);
  });

  it('alterar cria a versao seguinte e a original fica intacta', async () => {
    const r = await receita();

    // Sem mudancas: recusado.
    const igual = await novaVersao({ ok: true }, form({ id: r.id, ...RECEITA, changeNote: 'nada' }));
    expect(igual.ok).toBe(false);
    expect(igual.message).toMatch(/Nada mudou/);

    // Sem dizer porque: recusado.
    const semNota = await novaVersao(
      { ok: true },
      form({ id: r.id, ...RECEITA, ingredients: '3 ovos\n150 g de açúcar\n2 cenouras' }),
    );
    expect(semNota.ok).toBe(false);

    await expect(
      novaVersao(
        { ok: true },
        form({ id: r.id, ...RECEITA, ingredients: '3 ovos\n150 g de açúcar\n2 cenouras', changeNote: 'Menos doce' }),
      ),
    ).rejects.toThrow(/^REDIRECT/);

    const depois = await prisma.bookRecipe.findUniqueOrThrow({
      where: { id: r.id },
      include: { versions: { orderBy: { number: 'asc' } } },
    });
    expect(depois.currentVersion).toBe(2);
    expect(depois.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(depois.versions[0].ingredients).toBe(RECEITA.ingredients);
    expect(depois.versions[1]).toMatchObject({ changeNote: 'Menos doce', authorName: 'Ana Cozinha' });

    // Voltar a original e so escolher a versao.
    expect((await usarVersao({ ok: true }, form({ id: r.id, number: '1' }))).ok).toBe(true);
    expect((await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } })).currentVersion).toBe(1);
    expect((await usarVersao({ ok: true }, form({ id: r.id, number: '9' }))).ok).toBe(false);
  });

  it('arquivada sai da lista e nao se altera; recupera-se', async () => {
    const r = await receita();
    expect((await arquivarReceita({ ok: true }, form({ id: r.id }))).ok).toBe(true);
    expect((await listarReceitas({})).some((x) => x.id === r.id)).toBe(false);
    expect((await listarReceitas({ arquivadas: true })).some((x) => x.id === r.id)).toBe(true);

    const r2 = await novaVersao({ ok: true }, form({ id: r.id, ...RECEITA, steps: 'Outro', changeNote: 'x' }));
    expect(r2.ok).toBe(false);

    await arquivarReceita({ ok: true }, form({ id: r.id }));
    expect((await listarReceitas({})).some((x) => x.id === r.id)).toBe(true);
  });

  it('a busca encontra por ingrediente e sem acentos', async () => {
    const r = await receita();
    expect((await listarReceitas({ busca: 'acucar cenouras' })).some((x) => x.id === r.id)).toBe(true);
    expect((await listarReceitas({ busca: 'avo maria' })).some((x) => x.id === r.id)).toBe(true);
    expect((await listarReceitas({ busca: 'chocolate' })).some((x) => x.id === r.id)).toBe(false);
  });
});

describe('permissoes', () => {
  it('a leitura nao cria nem altera', async () => {
    const r = await receita();
    comoSe('READER', null, 'Leitor');
    const c = await criarReceita({ ok: true }, form({ title: nome('X'), ...RECEITA }));
    expect(c).toEqual({ ok: false, message: 'Sem permissao para isto.' });
    const v = await novaVersao({ ok: true }, form({ id: r.id, ...RECEITA, steps: 'x', changeNote: 'y' }));
    expect(v.ok).toBe(false);
    expect((await arquivarReceita({ ok: true }, form({ id: r.id }))).ok).toBe(false);
  });

  it('a cozinha nao apaga de vez nem mexe no resto da app', async () => {
    const r = await receita();
    comoSe('KITCHEN', cozinha.id, cozinha.name);
    expect((await apagarReceita({ ok: true }, form({ id: r.id }))).ok).toBe(false);
    // Uma action de custos, chamada pela cozinha: recusada.
    const ficha = await saveRecipe({ ok: true }, form({ name: nome('Ficha'), kind: 'PRODUCT', yieldQty: '1' }));
    expect(ficha).toEqual({ ok: false, message: 'Sem permissao para isto.' });
    // Sem sessao: recusada tambem.
    comoSe(null);
    expect((await criarReceita({ ok: true }, form({ title: nome('Y'), ...RECEITA }))).ok).toBe(false);
  });

  it('a cozinha nao liga fichas tecnicas (o campo e ignorado); o dono sim', async () => {
    comoSe('OWNER', dono.id, dono.name);
    await saveRecipe({ ok: true }, form({ name: nome('Ficha'), kind: 'PRODUCT', yieldQty: '1' }));
    const ficha = await prisma.recipe.findFirstOrThrow({ where: { name: { startsWith: `${MARCA}Ficha` } } });

    const r = await receita({ fichaId: ficha.id });
    expect(r.fichaId).toBeNull();

    comoSe('OWNER', dono.id, dono.name);
    expect((await alterarDadosReceita({ ok: true }, form({ id: r.id, fichaId: ficha.id }))).ok).toBe(true);
    expect((await prisma.bookRecipe.findUniqueOrThrow({ where: { id: r.id } })).fichaId).toBe(ficha.id);
  });

  it('o dono apaga de vez, com as versoes', async () => {
    const r = await receita();
    comoSe('OWNER', dono.id, dono.name);
    await expect(apagarReceita({ ok: true }, form({ id: r.id }))).rejects.toThrow(/^REDIRECT \/receitas$/);
    expect(await prisma.bookRecipe.findUnique({ where: { id: r.id } })).toBeNull();
    expect(await prisma.bookRecipeVersion.count({ where: { recipeId: r.id } })).toBe(0);
  });

  it('um ficheiro original de fora do prefixo e recusado', async () => {
    comoSe('KITCHEN', cozinha.id, cozinha.name);
    const r = await criarReceita(
      { ok: true },
      form({ title: nome('Z'), ...RECEITA, sourceFilePath: 'fotos/de-outro.jpg' }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('livros', () => {
  it('junta, nao repete, ordena, tira — e as arquivadas nao aparecem', async () => {
    comoSe('KITCHEN', cozinha.id, cozinha.name);
    const titulo = nome('Livro');
    await expect(criarLivro({ ok: true }, form({ title: titulo }))).rejects.toThrow(/^REDIRECT \/livros\//);
    const livro = await prisma.cookbook.findFirstOrThrow({ where: { title: titulo } });

    const a = await receita();
    const b = await receita();
    comoSe('KITCHEN', cozinha.id, cozinha.name);
    expect((await juntarAoLivro({ ok: true }, form({ cookbookId: livro.id, recipeId: a.id, section: 'Bolos' }))).ok).toBe(true);
    expect((await juntarAoLivro({ ok: true }, form({ cookbookId: livro.id, recipeId: b.id }))).ok).toBe(true);
    expect((await juntarAoLivro({ ok: true }, form({ cookbookId: livro.id, recipeId: a.id }))).ok).toBe(false);

    let d = (await detalheLivro(livro.id))!;
    expect(d.entries.map((e) => e.recipe.id)).toEqual([a.id, b.id]);

    await moverEntrada({ ok: true }, form({ id: d.entries[1].id, sentido: 'cima' }));
    d = (await detalheLivro(livro.id))!;
    expect(d.entries.map((e) => e.recipe.id)).toEqual([b.id, a.id]);

    await arquivarReceita({ ok: true }, form({ id: b.id }));
    d = (await detalheLivro(livro.id))!;
    expect(d.entries.map((e) => e.recipe.id)).toEqual([a.id]);

    expect((await tirarDoLivro({ ok: true }, form({ id: d.entries[0].id }))).ok).toBe(true);
    // A receita continua a existir.
    expect(await prisma.bookRecipe.findUnique({ where: { id: a.id } })).not.toBeNull();
  });
});

describe('importar', () => {
  it('le texto colado e devolve a receita separada, sem criar nada', async () => {
    comoSe('KITCHEN', cozinha.id, cozinha.name);
    const antesDe = await prisma.bookRecipe.count();
    const r = await importarReceita(
      { ok: true },
      form({ texto: 'Brigadeiro\nIngredientes\n- 1 lata de leite condensado\nModo de preparo\n1. Leve ao lume.' }),
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.receita).toMatchObject({
      title: 'Brigadeiro',
      ingredients: ['1 lata de leite condensado'],
      steps: ['Leve ao lume.'],
    });
    expect(await prisma.bookRecipe.count()).toBe(antesDe);

    comoSe('READER');
    expect((await importarReceita({ ok: true }, form({ texto: 'x' }))).ok).toBe(false);
  });
});
