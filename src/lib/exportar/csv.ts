/**
 * Folhas de calculo em CSV que o Excel em portugues abre sem perguntar nada.
 *
 * Tres detalhes que decidem se o ficheiro abre bem ou vira uma coluna so:
 *
 * - **Ponto e virgula** a separar colunas. Em pt-PT a virgula e a casa
 *   decimal, e o Excel espera `;` quando o sistema esta em portugues.
 * - **Virgula decimal** nos numeros, sem separador de milhares. `1.250` seria
 *   lido como mil duzentos e cinquenta — o defeito do ponto que ja custou caro
 *   nos insumos (ver `parseDecimal` em `lib/money.ts`).
 * - **BOM UTF-8** no inicio. Sem ele o Excel le "Acucar" com lixo no lugar
 *   dos acentos.
 *
 * E um cuidado de seguranca: texto que comeca por `=`, `+`, `-` ou `@` leva
 * um apostrofo a frente. Senao, uma nota escrita como `=HYPERLINK(...)` virava
 * formula ao abrir o ficheiro.
 */

export type Celula = string | number | boolean | Date | null | undefined;

export const BOM = '﻿';
const SEPARADOR = ';';
const FIM_DE_LINHA = '\r\n';

/** Casas decimais que chegam para 0,5 g em kg sem virar ruido de virgula flutuante. */
const CASAS = 6;

export function numeroCsv(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toFixed(CASAS))).replace('.', ',');
}

/** Data e hora de Lisboa, no formato que o Excel pt-PT reconhece como data. */
export function dataCsv(d: Date): string {
  const partes = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function textoCsv(s: string): string {
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function celulaCsv(v: Celula): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return numeroCsv(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Nao';
  if (v instanceof Date) return dataCsv(v);
  return textoCsv(v);
}

export function montarCsv(cabecalho: string[], linhas: Celula[][]): string {
  const todas = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(SEPARADOR));
  return BOM + todas.join(FIM_DE_LINHA) + FIM_DE_LINHA;
}
