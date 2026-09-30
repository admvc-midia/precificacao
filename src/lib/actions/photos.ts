'use server';

/**
 * Pôr, trocar e tirar a foto de uma ficha.
 *
 * O telemovel ja manda a foto reduzida (1600 px) e a miniatura (320 px), em
 * JPEG: e mais rapido na rede da cozinha e cabe no limite das actions. Aqui
 * so se confere que sao mesmo imagens e do tamanho esperado.
 *
 * Ordem das operacoes: grava a nova, aponta a ficha para ela, e so depois
 * apaga a antiga. Se algo falhar a meio, fica no pior dos casos um ficheiro
 * a mais no Blob — nunca uma ficha a apontar para uma foto que ja nao existe.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { apagarFotos, gravarFotos, lerImagem, MAX_FOTO, MAX_MINI } from '@/lib/fotos';
import { errorMessage, type ActionState } from './shared';

function revalidar(id: string) {
  revalidatePath(`/fichas/${id}`);
  revalidatePath('/fichas');
  revalidatePath('/precificacao', 'layout');
}

export async function saveRecipePhoto(_prev: ActionState, form: FormData): Promise<ActionState> {
  let novos: { photoPath: string; photoThumbPath: string } | null = null;
  try {
    const id = String(form.get('id') ?? '');
    const ficha = await prisma.recipe.findUnique({
      where: { id },
      select: { photoPath: true, photoThumbPath: true },
    });
    if (!ficha) throw new Error('Ficha nao encontrada.');

    const foto = await lerImagem(form.get('foto'), MAX_FOTO, 'foto');
    const mini = await lerImagem(form.get('mini'), MAX_MINI, 'miniatura');

    novos = await gravarFotos(id, foto, mini);
    await prisma.recipe.update({ where: { id }, data: novos });
    await apagarFotos([ficha.photoPath, ficha.photoThumbPath]);

    revalidar(id);
    return { ok: true, message: ficha.photoPath ? 'Foto trocada.' : 'Foto guardada.' };
  } catch (err) {
    // Gravou no Blob mas a ficha nao ficou a apontar: nao deixar o ficheiro orfao.
    if (novos) await apagarFotos([novos.photoPath, novos.photoThumbPath]);
    return { ok: false, message: errorMessage(err) };
  }
}

export async function removeRecipePhoto(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const ficha = await prisma.recipe.findUnique({
      where: { id },
      select: { photoPath: true, photoThumbPath: true },
    });
    if (!ficha) throw new Error('Ficha nao encontrada.');
    await prisma.recipe.update({ where: { id }, data: { photoPath: null, photoThumbPath: null } });
    await apagarFotos([ficha.photoPath, ficha.photoThumbPath]);
    revalidar(id);
    return { ok: true, message: 'Foto removida.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
