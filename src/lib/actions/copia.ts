'use server';

/**
 * Restaurar uma copia completa, em dois passos: analisar (le o ficheiro e diz
 * o que muda, sem tocar na base) e restaurar (com "RESTAURAR" escrito a mao).
 * So o dono.
 */

import { revalidatePath } from 'next/cache';

import { copiaCompleta, copiaEmJson } from '@/lib/exportar/gerar';
import { guardarCopia } from '@/lib/exportar/guardadas';
import {
  analisarCopia,
  lerCopia,
  MAX_COPIA,
  restaurar,
  type LinhaDaAnalise,
} from '@/lib/exportar/restaurar';
import { registar } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

export interface AnaliseState extends ActionState {
  gravadoEm?: string;
  versao?: string;
  tabelas?: LinhaDaAnalise[];
  avisos?: string[];
}

async function lerFicheiro(form: FormData) {
  const ficheiro = form.get('ficheiro');
  if (!(ficheiro instanceof File) || ficheiro.size === 0) throw new Error('Escolha o ficheiro da copia (.json).');
  if (ficheiro.size > MAX_COPIA) {
    throw new Error(`O ficheiro tem ${(ficheiro.size / 1_000_000).toFixed(1)} MB; uma copia desta app tem bem menos. Confirme que e o ficheiro certo.`);
  }
  return lerCopia(await ficheiro.text());
}

export async function analisarCopiaAction(_prev: AnaliseState, form: FormData): Promise<AnaliseState> {
  try {
    await exigirDono();
    const c = await lerFicheiro(form);
    return { ok: true, gravadoEm: c.gravadoEm, versao: c.versao, tabelas: await analisarCopia(c), avisos: c.avisos };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function restaurarCopiaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    if (String(form.get('confirmacao') ?? '').trim().toUpperCase() !== 'RESTAURAR') {
      throw new Error('Para confirmar, escreva RESTAURAR.');
    }
    const c = await lerFicheiro(form);

    // Primeiro a copia do que esta agora. Se falhar, nao se restaura.
    const antes = await guardarCopia(copiaEmJson(await copiaCompleta()), 'antes-de-restaurar');
    const contagem = await restaurar(c);

    const total = Object.values(contagem).reduce((a, b) => a + b, 0);
    await registar({
      quem: eu,
      acao: 'copia.restaurar',
      alvo: `copia de ${c.gravadoEm.slice(0, 16).replace('T', ' ')}`,
      detalhe: `${total} linhas repostas; a de antes ficou em ${antes}`,
    });
    revalidatePath('/', 'layout');
    const dia = new Date(c.gravadoEm).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' });
    return {
      ok: true,
      message: `Restaurada a copia de ${dia}. O que havia antes ficou guardado em "Copias guardadas pela app".`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
