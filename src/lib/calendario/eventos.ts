/**
 * Junta as datas conhecidas (calculadas) com os eventos do dono (na base),
 * num intervalo de dias. Puro: as consultas a base estao em `consultas.ts`.
 *
 * Uma data conhecida que o dono completou (plano, notas) tem uma linha com
 * `knownKey`; o dia continua a vir do calculo. Os eventos do dono repetem-se
 * todos os anos se `yearly` — os de 29/2 caem a 28/2 nos anos comuns.
 */

import { datasDoAno, somarDias, type Pais } from './datas';

export type Acao = 'MORE' | 'LESS' | 'NONE';
export type Tipo = 'EVENT' | 'TREND' | 'TEAM';

export interface Plano {
  id: string;
  recipeId: string;
  produto: string;
  acao: Acao;
  qty: number | null;
  nota: string | null;
}

/** Uma linha de CalendarEvent, com o plano e as revisoes ja lidos. */
export interface Registo {
  id: string;
  knownKey: string | null;
  title: string;
  /** AAAA-MM-DD, nos eventos do dono. */
  day: string | null;
  yearly: boolean;
  kind: Tipo;
  notes: string | null;
  planos: Plano[];
  revisoes: Array<{ ano: number; texto: string }>;
}

export interface Ocorrencia {
  /** Unico na lista: a data conhecida ou o evento, mais o dia. */
  chaveUnica: string;
  /** A linha na base, se houver. */
  eventoId: string | null;
  /** A data conhecida, se for uma. */
  chave: string | null;
  titulo: string;
  dia: string;
  /** Vazio nos eventos do dono. */
  paises: Pais[];
  feriado: boolean;
  /** O que a app ja sabe desta data ("Bolo-rei."). */
  notaFixa: string | null;
  /** 'KNOWN' para as datas conhecidas. */
  tipo: Tipo | 'KNOWN';
  anual: boolean;
  notas: string | null;
  planos: Plano[];
  revisoes: Array<{ ano: number; texto: string }>;
}

function anosEntre(inicio: string, fim: string): number[] {
  const out: number[] = [];
  for (let a = Number(inicio.slice(0, 4)); a <= Number(fim.slice(0, 4)); a++) out.push(a);
  return out;
}

/** O mesmo dia e mes noutro ano; 29/2 cai a 28/2 nos anos comuns. */
export function noAno(dia: string, ano: number): string {
  const [, m, d] = dia.split('-').map(Number);
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dd = m === 2 && d === 29 && !bissexto ? 28 : d;
  return `${ano}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Tudo o que acontece entre `inicio` e `fim` (inclusive, AAAA-MM-DD), por dia. */
export function eventosEntre(inicio: string, fim: string, registos: Registo[]): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  const porChave = new Map(registos.filter((r) => r.knownKey).map((r) => [r.knownKey!, r]));
  const dentro = (dia: string) => dia >= inicio && dia <= fim;

  for (const ano of anosEntre(inicio, fim)) {
    for (const d of datasDoAno(ano)) {
      if (!dentro(d.dia)) continue;
      const r = porChave.get(d.chave);
      out.push({
        chaveUnica: `${d.chave}@${d.dia}`,
        eventoId: r?.id ?? null,
        chave: d.chave,
        titulo: d.titulo,
        dia: d.dia,
        paises: d.paises,
        feriado: d.feriado,
        notaFixa: d.nota ?? null,
        tipo: 'KNOWN',
        anual: true,
        notas: r?.notes ?? null,
        planos: r?.planos ?? [],
        revisoes: r?.revisoes ?? [],
      });
    }
  }

  for (const r of registos) {
    if (r.knownKey || !r.day) continue;
    const dias = r.yearly ? anosEntre(inicio, fim).map((a) => noAno(r.day!, a)) : [r.day];
    for (const dia of dias) {
      // Um evento anual so aparece a partir do ano em que foi marcado.
      if (!dentro(dia) || dia < r.day) continue;
      out.push({
        chaveUnica: `${r.id}@${dia}`,
        eventoId: r.id,
        chave: null,
        titulo: r.title,
        dia,
        paises: [],
        feriado: false,
        notaFixa: null,
        tipo: r.kind,
        anual: r.yearly,
        notas: r.notes,
        planos: r.planos,
        revisoes: r.revisoes,
      });
    }
  }

  // Feriados primeiro dentro do mesmo dia: e o que mais muda o dia da casa.
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || Number(b.feriado) - Number(a.feriado) || a.titulo.localeCompare(b.titulo));
}

/**
 * O dia equivalente no ano anterior, para mostrar o que se vendeu: a mesma
 * data conhecida (a Pascoa do ano passado, nao o mesmo dia do mes), ou o mesmo
 * dia e mes num evento anual. Um evento de uma vez nao tem ano anterior.
 */
export function diaNoAnoAnterior(o: Ocorrencia): string | null {
  const ano = Number(o.dia.slice(0, 4)) - 1;
  if (o.chave) return datasDoAno(ano).find((d) => d.chave === o.chave)?.dia ?? null;
  return o.anual ? noAno(o.dia, ano) : null;
}

/** As semanas do mes, de segunda a domingo, com os dias de fora do mes para encher. */
export function semanasDoMes(mes: string): string[][] {
  const primeiro = `${mes}-01`;
  const diaDaSemana = (new Date(`${primeiro}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  let dia = somarDias(primeiro, -diaDaSemana);
  const semanas: string[][] = [];
  do {
    const semana: string[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push(dia);
      dia = somarDias(dia, 1);
    }
    semanas.push(semana);
  } while (dia.slice(0, 7) === mes);
  return semanas;
}

/** "2026-10" mais `n` meses. */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

export const ACAO_LABEL: Record<Acao, string> = {
  MORE: 'Produzir mais',
  LESS: 'Produzir menos',
  NONE: 'Não produzir',
};

export const TIPO_LABEL: Record<Tipo, string> = {
  EVENT: 'Evento',
  TREND: 'Tendência',
  TEAM: 'Equipa',
};
