'use server';

/**
 * Livro de receitas: receitas, versoes, livros e importacao.
 *
 * Quem pode o que (ver `UserRole`):
 *  - ler e imprimir: qualquer conta;
 *  - criar, criar versoes, arquivar, organizar livros: dono e cozinha;
 *  - apagar de vez (receitas e livros) e ligar a ficha tecnica: so o dono.
 *
 * Uma versao nunca se altera. Mudar a receita e criar a seguinte — a 1 fica
 * sempre como veio da fonte, e cada versao guarda quem a fez e porque.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { parseQty } from '@/lib/money';
import { apagarFotos, gravarFotos, lerImagem, MAX_FOTO, MAX_MINI } from '@/lib/fotos';
import {
  apagarOriginal,
  ePdf,
  gravarOriginal,
  MAX_ORIGINAL,
  PREFIXO_ORIGINAIS,
} from '@/lib/livro/ficheiros';
import { lerReceita, textoDoPdf, type ReceitaLida } from '@/lib/livro/importar';
import {
  juntarPassos,
  lerEtiquetas,
  linhas,
  passos,
  urlSegura,
  type SourceKind,
} from '@/lib/livro/receita';
import { alvoDoFormulario, registar, resumoDoFormulario } from '@/lib/registo';
import { exigirDono, exigirEditorDoLivro } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const ORIGENS: SourceKind[] = ['FAMILY', 'COURSE', 'BOOK', 'INTERNET', 'OWN', 'OTHER'];

/** Limites de tamanho: generosos para uma receita, curtos para um abuso. */
const MAX_TEXTO = 20_000;
const MAX_CURTO = 200;

function campo(form: FormData, nome: string): string | undefined {
  return form.has(nome) ? String(form.get(nome) ?? '').trim() : undefined;
}

function curto(valor: string | undefined, rotulo: string): string | null {
  if (!valor) return null;
  if (valor.length > MAX_CURTO) throw new Error(`${rotulo}: no maximo ${MAX_CURTO} caracteres.`);
  return valor;
}

function revalidar(id?: string) {
  revalidatePath('/receitas');
  if (id) revalidatePath(`/receitas/${id}`, 'layout');
  revalidatePath('/livros', 'layout');
}

/** O conteudo de uma versao, lido e validado do formulario. */
function lerConteudo(form: FormData) {
  const ingredients = linhas(campo(form, 'ingredients') ?? '').join('\n');
  const steps = juntarPassos(passos(campo(form, 'steps') ?? ''));
  const notes = campo(form, 'notes') || null;
  if (!ingredients) throw new Error('Escreva os ingredientes, um por linha.');
  if (!steps) throw new Error('Escreva o modo de preparo.');
  for (const [v, r] of [
    [ingredients, 'Ingredientes'],
    [steps, 'Modo de preparo'],
    [notes ?? '', 'Notas'],
  ] as const) {
    if (v.length > MAX_TEXTO) throw new Error(`${r}: texto grande demais.`);
  }
  return {
    ingredients,
    steps,
    notes,
    yield: curto(campo(form, 'yield'), 'Rendimento'),
    prepTime: curto(campo(form, 'prepTime'), 'Tempo'),
  };
}

/** Os dados que nao mudam de versao para versao. Por presenca, como o resto da app. */
function lerDados(form: FormData, dono: boolean) {
  const data: {
    title?: string;
    sourceKind?: SourceKind | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    tags?: string[];
    fichaId?: string | null;
  } = {};

  const title = campo(form, 'title');
  if (title !== undefined) {
    if (!title) throw new Error('Escreva o titulo da receita.');
    data.title = curto(title, 'Titulo')!;
  }
  const kind = campo(form, 'sourceKind');
  if (kind !== undefined) {
    if (kind && !ORIGENS.includes(kind as SourceKind)) throw new Error('Origem invalida.');
    data.sourceKind = (kind || null) as SourceKind | null;
  }
  const sourceName = campo(form, 'sourceName');
  if (sourceName !== undefined) data.sourceName = curto(sourceName, 'De onde veio');
  const sourceUrl = campo(form, 'sourceUrl');
  if (sourceUrl !== undefined) {
    data.sourceUrl = sourceUrl ? urlSegura(sourceUrl) : null;
    if (sourceUrl && !data.sourceUrl) throw new Error('O link tem de comecar por http:// ou https://.');
  }
  const tags = campo(form, 'tags');
  if (tags !== undefined) data.tags = lerEtiquetas(tags);

  // A ficha tecnica tem custos: so o dono a liga, e o campo vindo de outra
  // conta e ignorado em vez de dar erro (o formulario dela nem o mostra).
  const fichaId = campo(form, 'fichaId');
  if (fichaId !== undefined && dono) data.fichaId = fichaId || null;

  return data;
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

/**
 * Cria a receita com a versao 1 — a original. Vinda de uma importacao, traz o
 * caminho do PDF ja guardado (`sourceFilePath`), que so se aceita com o
 * prefixo dos originais e se ainda nao pertencer a outra receita.
 */
export async function criarReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const eu = await exigirEditorDoLivro();
    const dados = lerDados(form, eu.perfil === 'OWNER');
    if (!dados.title) throw new Error('Escreva o titulo da receita.');
    const conteudo = lerConteudo(form);

    const caminho = campo(form, 'sourceFilePath') || null;
    if (caminho) {
      if (!caminho.startsWith(PREFIXO_ORIGINAIS) || caminho.includes('..')) {
        throw new Error('Ficheiro original invalido.');
      }
      if (await prisma.bookRecipe.findFirst({ where: { sourceFilePath: caminho } })) {
        throw new Error('Esse ficheiro ja pertence a outra receita.');
      }
    }

    const cookbookId = campo(form, 'cookbookId') || null;
    const r = await prisma.bookRecipe.create({
      data: {
        ...dados,
        title: dados.title,
        sourceFilePath: caminho,
        sourceFileName: caminho ? curto(campo(form, 'sourceFileName'), 'Nome do ficheiro') : null,
        versions: {
          create: { number: 1, ...conteudo, authorId: eu.id, authorName: eu.name, changeNote: 'Original' },
        },
        ...(cookbookId
          ? { entries: { create: { cookbookId, section: curto(campo(form, 'section'), 'Seccao') } } }
          : {}),
      },
    });
    id = r.id;
    revalidar(id);
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/receitas/${id}`);
}

/**
 * Uma versao nova, a partir do formulario de edicao. Passa a ser a versao em
 * uso. Recusa-se se nada mudou — uma versao igual a anterior so baralhava o
 * historico.
 */
export async function novaVersao(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const eu = await exigirEditorDoLivro();
    id = campo(form, 'id') ?? '';
    const receita = await prisma.bookRecipe.findUnique({
      where: { id },
      include: { versions: { orderBy: { number: 'desc' } } },
    });
    if (!receita) throw new Error('Receita nao encontrada.');
    if (receita.archivedAt) throw new Error('Esta receita esta arquivada. Recupere-a antes de a alterar.');

    const conteudo = lerConteudo(form);
    const base = receita.versions.find((v) => v.number === receita.currentVersion) ?? receita.versions[0];
    const igual =
      base &&
      base.ingredients === conteudo.ingredients &&
      base.steps === conteudo.steps &&
      (base.notes ?? null) === conteudo.notes &&
      (base.yield ?? null) === conteudo.yield &&
      (base.prepTime ?? null) === conteudo.prepTime;
    if (igual) throw new Error('Nada mudou em relacao a versao em uso.');

    const changeNote = campo(form, 'changeNote') || null;
    if (!changeNote) throw new Error('Diga o que mudou e porque — fica no historico.');
    const numero = (receita.versions[0]?.number ?? 0) + 1;

    await prisma.$transaction([
      prisma.bookRecipeVersion.create({
        data: {
          recipeId: id,
          number: numero,
          ...conteudo,
          changeNote: curto(changeNote, 'O que mudou'),
          authorId: eu.id,
          authorName: eu.name,
        },
      }),
      prisma.bookRecipe.update({ where: { id }, data: { currentVersion: numero } }),
    ]);
    revalidar(id);
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/receitas/${id}`);
}

/** Titulo, origem, etiquetas (e ficha, se for o dono). Nao cria versao. */
export async function alterarDadosReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Receita nao informada.');
    await prisma.bookRecipe.update({ where: { id }, data: lerDados(form, eu.perfil === 'OWNER') });
    revalidar(id);
    return { ok: true, message: 'Receita atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Cria a ficha tecnica a partir da receita do livro, com as linhas que o dono
 * reviu em `/receitas/<id>/ficha`, e liga-as. Fica um produto final, com o
 * rendimento em unidades/porcoes.
 *
 * Os campos chegam como `linha.<n>.incluir`, `linha.<n>.ref` ("ING:<id>" ou
 * "REC:<id>") e `linha.<n>.qty` (na unidade em que a ficha mostra: kg, L ou
 * un — a unidade sai do insumo ou da preparacao escolhida, nunca do browser).
 */
export async function criarFichaDaReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  let fichaId: string;
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id') ?? '';
    const receita = await prisma.bookRecipe.findUnique({ where: { id }, select: { title: true, fichaId: true } });
    if (!receita) throw new Error('Receita nao encontrada.');
    if (receita.fichaId) throw new Error('Esta receita ja tem ficha tecnica.');

    const name = (campo(form, 'name') ?? '').trim();
    if (!name) throw new Error('De um nome a ficha.');
    if (name.length > 120) throw new Error('Nome demasiado longo.');
    if (await prisma.recipe.findUnique({ where: { name }, select: { id: true } })) {
      throw new Error(`Ja existe uma ficha chamada "${name}". Escolha outro nome.`);
    }
    const yieldQty = parseQty(campo(form, 'yieldQty') ?? '');
    if (!(yieldQty > 0)) throw new Error('Diga quanto rende (unidades ou porcoes).');

    const indices = new Set<string>();
    for (const k of form.keys()) {
      const m = /^linha\.(\d+)\.incluir$/.exec(k);
      if (m && form.get(k) === 'on') indices.add(m[1]);
    }
    const pedidas = [...indices]
      .sort((a, b) => Number(a) - Number(b))
      .map((i) => ({
        n: Number(i) + 1,
        original: campo(form, `linha.${i}.original`) ?? '',
        ref: campo(form, `linha.${i}.ref`) ?? '',
        qty: parseQty(campo(form, `linha.${i}.qty`) ?? ''),
      }));
    if (pedidas.length === 0) throw new Error('Inclua pelo menos um ingrediente.');
    for (const l of pedidas) {
      if (!/^(ING|REC):.+/.test(l.ref)) throw new Error(`Linha ${l.n} ("${l.original}"): escolha o insumo.`);
      if (!(l.qty > 0)) throw new Error(`Linha ${l.n} ("${l.original}"): escreva a quantidade.`);
    }

    // A unidade de cada linha sai do que foi escolhido.
    const ingIds = pedidas.filter((l) => l.ref.startsWith('ING:')).map((l) => l.ref.slice(4));
    const recIds = pedidas.filter((l) => l.ref.startsWith('REC:')).map((l) => l.ref.slice(4));
    const [ings, recs] = await Promise.all([
      prisma.ingredient.findMany({ where: { id: { in: ingIds } }, select: { id: true, baseUnit: true } }),
      prisma.recipe.findMany({ where: { id: { in: recIds }, kind: 'BASE' }, select: { id: true, yieldUnit: true } }),
    ]);
    const baseDe = new Map<string, 'G' | 'ML' | 'UN'>([
      ...ings.map((i) => [`ING:${i.id}`, i.baseUnit] as const),
      ...recs.map((r) => [`REC:${r.id}`, r.yieldUnit] as const),
    ]);
    const UNIDADE = { G: 'KG', ML: 'L', UN: 'UN' } as const;
    const itens = pedidas.map((l, sortOrder) => {
      const base = baseDe.get(l.ref);
      if (!base) throw new Error(`Linha ${l.n} ("${l.original}"): o insumo ja nao existe.`);
      return {
        ingredientId: l.ref.startsWith('ING:') ? l.ref.slice(4) : null,
        childRecipeId: l.ref.startsWith('REC:') ? l.ref.slice(4) : null,
        qty: l.qty,
        unit: UNIDADE[base],
        sortOrder,
        notes: l.original.slice(0, 200) || null,
      };
    });

    const ficha = await prisma.$transaction(async (tx) => {
      const f = await tx.recipe.create({
        data: { name, kind: 'PRODUCT', yieldQty, yieldUnit: 'UN', items: { create: itens } },
        select: { id: true },
      });
      await tx.bookRecipe.update({ where: { id }, data: { fichaId: f.id } });
      return f;
    });
    fichaId = ficha.id;
    revalidar(id);
    revalidatePath('/fichas');
    revalidatePath('/precificacao');
    await registar({ quem: eu, acao: 'receita.criar-ficha', alvo: receita.title, detalhe: `${name}, ${itens.length} linha(s)` });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/fichas/${fichaId}`);
}

/** Escolhe a versao em uso — voltar a uma anterior e so isto. */
export async function usarVersao(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirEditorDoLivro();
    const id = campo(form, 'id');
    const numero = Number(campo(form, 'number'));
    if (!id || !Number.isInteger(numero)) throw new Error('Versao invalida.');
    const v = await prisma.bookRecipeVersion.findUnique({
      where: { recipeId_number: { recipeId: id, number: numero } },
    });
    if (!v) throw new Error('Versao nao encontrada.');
    await prisma.bookRecipe.update({ where: { id }, data: { currentVersion: numero } });
    revalidar(id);
    await registar({ quem: eu, acao: 'receita.usar-versao', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: `A versão ${numero} passou a ser a usada.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Arquivar e recuperar: a cozinha nao apaga, arquiva. */
export async function arquivarReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Receita nao informada.');
    const r = await prisma.bookRecipe.findUniqueOrThrow({ where: { id }, select: { archivedAt: true } });
    await prisma.bookRecipe.update({
      where: { id },
      data: { archivedAt: r.archivedAt ? null : new Date() },
    });
    revalidar(id);
    await registar({ quem: eu, acao: 'receita.arquivar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
    return { ok: true, message: r.archivedAt ? 'Receita recuperada.' : 'Receita arquivada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Apagar de vez, com todas as versoes e o PDF original. So o dono. */
export async function apagarReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Receita nao informada.');
    const r = await prisma.bookRecipe.delete({ where: { id } });
    await apagarOriginal(r.sourceFilePath);
    await apagarFotos([r.photoPath, r.photoThumbPath]);
    revalidar();
    await registar({ quem: eu, acao: 'receita.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/receitas');
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

/**
 * Por, trocar ou tirar a foto de uma receita. Como nas fichas: o telemovel ja
 * manda a foto reduzida e a miniatura; grava-se a nova, aponta-se a receita
 * para ela, e so depois se apaga a antiga.
 */
export async function guardarFotoReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  let novos: { photoPath: string; photoThumbPath: string } | null = null;
  try {
    const eu = await exigirEditorDoLivro();
    const id = String(form.get('id') ?? '');
    const r = await prisma.bookRecipe.findUnique({
      where: { id },
      select: { title: true, photoPath: true, photoThumbPath: true },
    });
    if (!r) throw new Error('Receita nao encontrada.');

    const foto = await lerImagem(form.get('foto'), MAX_FOTO, 'foto');
    const mini = await lerImagem(form.get('mini'), MAX_MINI, 'miniatura');
    novos = await gravarFotos(id, foto, mini, 'livro/fotos');
    await prisma.bookRecipe.update({ where: { id }, data: novos });
    await apagarFotos([r.photoPath, r.photoThumbPath]);

    revalidar(id);
    await registar({ quem: eu, acao: 'receita.foto', alvo: r.title, detalhe: r.photoPath ? 'trocada' : 'nova' });
    return { ok: true, message: r.photoPath ? 'Foto trocada.' : 'Foto guardada.' };
  } catch (err) {
    // Gravou mas a receita nao ficou a apontar: nao deixar o ficheiro orfao.
    if (novos) await apagarFotos([novos.photoPath, novos.photoThumbPath]);
    return { ok: false, message: errorMessage(err) };
  }
}

export async function tirarFotoReceita(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirEditorDoLivro();
    const id = String(form.get('id') ?? '');
    const r = await prisma.bookRecipe.findUnique({
      where: { id },
      select: { title: true, photoPath: true, photoThumbPath: true },
    });
    if (!r) throw new Error('Receita nao encontrada.');
    await prisma.bookRecipe.update({ where: { id }, data: { photoPath: null, photoThumbPath: null } });
    await apagarFotos([r.photoPath, r.photoThumbPath]);
    revalidar(id);
    await registar({ quem: eu, acao: 'receita.foto', alvo: r.title, detalhe: 'removida' });
    return { ok: true, message: 'Foto removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

export interface ImportState extends ActionState {
  receita?: ReceitaLida;
  /** O texto extraido, para o ecra de revisao o mostrar ao lado. */
  texto?: string;
  /** O PDF guardado, para a receita o levar quando for criada. */
  ficheiro?: { caminho: string; nome: string } | null;
  /** Muda a cada leitura, para o formulario de revisao se refazer. */
  chave?: number;
}

/**
 * Le um PDF (ou texto colado) e devolve a receita separada, para rever. Nao
 * cria nada — so guarda o PDF original no Blob, para a receita o levar.
 */
export async function importarReceita(_prev: ImportState, form: FormData): Promise<ImportState> {
  try {
    await exigirEditorDoLivro();
    const ficheiro = form.get('ficheiro');
    const colado = String(form.get('texto') ?? '').trim();

    let texto: string;
    let guardado: ImportState['ficheiro'] = null;

    if (ficheiro instanceof File && ficheiro.size > 0) {
      if (ficheiro.size > MAX_ORIGINAL) {
        throw new Error(
          `O PDF tem ${(ficheiro.size / 1_000_000).toFixed(1)} MB e o maximo e 3,8 MB. Abra-o, copie o texto da receita e cole-o abaixo.`,
        );
      }
      const bytes = new Uint8Array(await ficheiro.arrayBuffer());
      if (ePdf(bytes)) {
        try {
          texto = await textoDoPdf(bytes);
        } catch {
          throw new Error('Nao consegui ler este PDF. Se esta protegido por palavra-passe, abra-o e copie o texto.');
        }
        const caminho = await gravarOriginal(bytes, ficheiro.name);
        guardado = caminho ? { caminho, nome: ficheiro.name.slice(0, MAX_CURTO) } : null;
      } else if (ficheiro.type.startsWith('text/') || /\.txt$/i.test(ficheiro.name)) {
        texto = new TextDecoder().decode(bytes);
      } else {
        throw new Error('Esse ficheiro nao e um PDF nem um .txt.');
      }
    } else if (colado) {
      texto = colado;
    } else {
      throw new Error('Escolha um PDF ou cole o texto da receita.');
    }

    if (texto.length > MAX_TEXTO * 3) texto = texto.slice(0, MAX_TEXTO * 3);
    return { ok: true, receita: lerReceita(texto), texto, ficheiro: guardado, chave: Date.now() };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Livros
// ---------------------------------------------------------------------------

export async function criarLivro(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    await exigirEditorDoLivro();
    const title = curto(campo(form, 'title'), 'Titulo');
    if (!title) throw new Error('De um titulo ao livro.');
    const l = await prisma.cookbook.create({
      data: {
        title,
        subtitle: curto(campo(form, 'subtitle'), 'Subtitulo'),
        description: campo(form, 'description')?.slice(0, 2000) || null,
      },
    });
    id = l.id;
    revalidar();
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/livros/${id}`);
}

export async function alterarLivro(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Livro nao informado.');
    const title = campo(form, 'title');
    if (title !== undefined && !title) throw new Error('O titulo nao pode ficar vazio.');
    const description = campo(form, 'description');
    await prisma.cookbook.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: curto(title, 'Titulo')! } : {}),
        ...(form.has('subtitle') ? { subtitle: curto(campo(form, 'subtitle'), 'Subtitulo') } : {}),
        ...(description !== undefined ? { description: description.slice(0, 2000) || null } : {}),
      },
    });
    revalidar();
    return { ok: true, message: 'Livro atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Apaga o livro, nao as receitas (que podem estar noutros livros). So o dono. */
export async function apagarLivro(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Livro nao informado.');
    await prisma.cookbook.delete({ where: { id } });
    revalidar();
    await registar({ quem: eu, acao: 'livro.apagar', alvo: alvoDoFormulario(form), detalhe: resumoDoFormulario(form) });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/livros');
}

/** Pos uma receita no livro, no fim da seccao. */
export async function juntarAoLivro(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirEditorDoLivro();
    const cookbookId = campo(form, 'cookbookId');
    const recipeId = campo(form, 'recipeId');
    if (!cookbookId || !recipeId) throw new Error('Escolha a receita.');
    if (await prisma.cookbookEntry.findUnique({ where: { cookbookId_recipeId: { cookbookId, recipeId } } })) {
      throw new Error('Essa receita ja esta neste livro.');
    }
    const ultima = await prisma.cookbookEntry.aggregate({
      where: { cookbookId },
      _max: { sortOrder: true },
    });
    await prisma.cookbookEntry.create({
      data: {
        cookbookId,
        recipeId,
        section: curto(campo(form, 'section'), 'Seccao'),
        sortOrder: (ultima._max.sortOrder ?? 0) + 1,
      },
    });
    revalidar(recipeId);
    return { ok: true, message: 'Receita juntada ao livro.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Seccao de uma receita no livro. */
export async function alterarEntrada(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Entrada nao informada.');
    await prisma.cookbookEntry.update({
      where: { id },
      data: { section: curto(campo(form, 'section'), 'Seccao') },
    });
    revalidar();
    return { ok: true, message: 'Seccao atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Sobe ou desce uma receita no livro, trocando com a vizinha. */
export async function moverEntrada(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Entrada nao informada.');
    const sentido = campo(form, 'sentido') === 'cima' ? -1 : 1;
    const e = await prisma.cookbookEntry.findUniqueOrThrow({ where: { id } });
    const todas = await prisma.cookbookEntry.findMany({
      where: { cookbookId: e.cookbookId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const i = todas.findIndex((x) => x.id === id);
    const j = i + sentido;
    if (j < 0 || j >= todas.length) return { ok: true };
    // Renumera tudo pela ordem nova: sortOrders repetidos (de dados antigos) nao baralham a troca.
    [todas[i], todas[j]] = [todas[j], todas[i]];
    await prisma.$transaction(
      todas.map((x, k) => prisma.cookbookEntry.update({ where: { id: x.id }, data: { sortOrder: k + 1 } })),
    );
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function tirarDoLivro(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await exigirEditorDoLivro();
    const id = campo(form, 'id');
    if (!id) throw new Error('Entrada nao informada.');
    await prisma.cookbookEntry.delete({ where: { id } });
    revalidar();
    return { ok: true, message: 'Tirada do livro. A receita continua no arquivo de receitas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
