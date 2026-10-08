/**
 * O calendario da casa: meses em hora de Lisboa.
 *
 * As datas guardadas como instantes (uma entrega, um movimento de estoque)
 * sao UTC. Um mes, para a casa, comeca a meia-noite de Lisboa — e no verao
 * Lisboa esta uma hora a frente: uma encomenda entregue as 00:30 de 1 de
 * agosto e, em UTC, 23:30 de 31 de julho. Contada em UTC, ia para julho.
 *
 * Tudo o que agrupa ou filtra por mes passa por aqui.
 */

const FUSO = 'Europe/Lisbon';

const partes = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Quantos minutos Lisboa esta a frente de UTC neste instante (0 ou 60). */
export function desvioDeLisboa(instante: Date): number {
  const p = Object.fromEntries(partes.formatToParts(instante).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((comoUtc - Math.floor(instante.getTime() / 60_000) * 60_000) / 60_000);
}

/** O mes ("2026-08") a que um instante pertence, no calendario de Lisboa. */
export function mesEmLisboa(instante: Date): string {
  const p = Object.fromEntries(partes.formatToParts(instante).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

/** O dia (AAAA-MM-DD) em Lisboa: depois das 23h de 31/12 em UTC ja pode ser 1/1 la. */
export function diaEmLisboa(instante: Date): string {
  const p = Object.fromEntries(partes.formatToParts(instante).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** O instante em que um dia comeca em Lisboa. */
function meiaNoiteEmLisboa(ano: number, mes: number, dia: number): Date {
  const palpite = new Date(Date.UTC(ano, mes - 1, dia));
  // O desvio a essa hora: as mudancas de hora em Portugal sao a 1:00 UTC de
  // um domingo, nunca a meia-noite do dia 1 — basta um palpite.
  return new Date(palpite.getTime() - desvioDeLisboa(palpite) * 60_000);
}

/** "2026-08" → [inicio de agosto, inicio de setembro), em instantes. */
export function intervaloDoMes(periodo: string): { start: Date; end: Date } {
  const [ano, mes] = periodo.split('-').map(Number);
  return {
    start: meiaNoiteEmLisboa(ano, mes, 1),
    end: mes === 12 ? meiaNoiteEmLisboa(ano + 1, 1, 1) : meiaNoiteEmLisboa(ano, mes + 1, 1),
  };
}

/** O mes corrente, em Lisboa. */
export function mesAtual(agora: Date = new Date()): string {
  return mesEmLisboa(agora);
}
