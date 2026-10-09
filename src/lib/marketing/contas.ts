/**
 * Campanhas de marketing: rotulos, progresso e atrasos. Sem base de dados.
 *
 * Os dias sao "AAAA-MM-DD" em hora de Lisboa (`diaEmLisboa`).
 */

import { normalizarCodigo } from '@/lib/pricing/cardapio';

export type EstadoCampanha = 'IDEA' | 'PLANNED' | 'ACTIVE' | 'DONE' | 'CANCELLED';
export type Canal = 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP' | 'GOOGLE' | 'PARTNERS' | 'PRINT' | 'EVENTS' | 'ADS';

/** Pela ordem em que uma campanha anda. */
export const ESTADOS: EstadoCampanha[] = ['IDEA', 'PLANNED', 'ACTIVE', 'DONE', 'CANCELLED'];

export const ESTADO_LABEL: Record<EstadoCampanha, string> = {
  IDEA: 'Ideia',
  PLANNED: 'Planeada',
  ACTIVE: 'A decorrer',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const CANAIS: Canal[] = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'GOOGLE', 'PARTNERS', 'PRINT', 'EVENTS', 'ADS'];

export const CANAL_LABEL: Record<Canal, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
  GOOGLE: 'Google',
  PARTNERS: 'Parcerias',
  PRINT: 'Impressos',
  EVENTS: 'Eventos e feiras',
  ADS: 'Anúncios pagos',
};

export interface TarefaInput {
  id: string;
  title: string;
  assignee: string | null;
  /** "AAAA-MM-DD" ou nulo. */
  dueAt: string | null;
  done: boolean;
}

/** Por fazer e com o prazo ja passado (o proprio dia ainda nao conta). */
export function atrasada(t: Pick<TarefaInput, 'done' | 'dueAt'>, hoje: string): boolean {
  return !t.done && t.dueAt !== null && t.dueAt < hoje;
}

export function progresso(tarefas: Pick<TarefaInput, 'done'>[]): { feitas: number; total: number } {
  return { feitas: tarefas.filter((t) => t.done).length, total: tarefas.length };
}

/**
 * A proxima tarefa por fazer: a de prazo mais cedo; sem prazo, pela ordem da
 * lista (que e a ordem em que chegam).
 */
export function proximaTarefa<T extends TarefaInput>(tarefas: T[]): T | null {
  const porFazer = tarefas.filter((t) => !t.done);
  if (porFazer.length === 0) return null;
  const comPrazo = porFazer.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  return comPrazo[0] ?? porFazer[0];
}

/** "  ana " e "Ana" sao a mesma pessoa no filtro "as minhas tarefas". */
export function mesmaPessoa(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: string | null | undefined) =>
    (x ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase();
  return n(a) !== '' && n(a) === n(b);
}

/**
 * Os codigos de cupao escritos no formulario ("bemvinda10, IG10 ig10"):
 * arrumados como os do cupao, sem repetidos nem vazios.
 */
export function lerCodigos(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map(normalizarCodigo).filter(Boolean))];
}
