/**
 * Despesas fixas: de uma lista de contas para a percentagem que o motor usa.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO RESOLVE
 * ---------------------------------------------------------------------------
 * `fixedCostRate` e a fatia da receita liquida que se vai em renda, luz,
 * salarios e o resto que se paga haja ou nao vendas. Entrou na configuracao
 * como 0,22 — um numero redondo, escolhido sem dados. Como o preco sugerido
 * sai de uma equacao onde essa percentagem e um termo, um palpite ali e um
 * palpite em todos os precos da casa, na mesma proporcao.
 *
 * Aqui lancam-se as contas a serio e a percentagem sai delas.
 *
 * ---------------------------------------------------------------------------
 * PORQUE A RECEITA TEM DE SER LIQUIDA
 * ---------------------------------------------------------------------------
 * O motor calcula `custoFixo = receitaLiquida * fixedCostRate`. Dividir as
 * despesas pela faturacao **bruta** daria uma percentagem menor do que a real
 * — em Portugal, com IVA de 13%, cerca de 11,5% menor — e a casa acharia que
 * os seus custos fixos pesam menos do que pesam.
 *
 * A conversao e a mesma nos dois modos de IVA. Com `INCLUDED` o preco de menu
 * ja traz o imposto, com `ADDED` ele soma-se ao preco; nos dois casos o que o
 * cliente paga inclui IVA, e a receita liquida e esse valor dividido por
 * (1 + IVA).
 *
 * Sem React, sem Prisma, como o resto de `lib/pricing`.
 */

/** Com que frequencia a conta chega. */
export type ExpensePeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/**
 * Quantas vezes por mes cada periodo acontece.
 *
 * A semana nao cabe num numero inteiro de vezes por mes: sao 52 semanas em 12
 * meses, e nao 4. Usar 4 subestimava as despesas semanais em cerca de 8%.
 */
const POR_MES: Record<ExpensePeriod, number> = {
  WEEKLY: 52 / 12,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
};

export const PERIOD_LABEL: Record<ExpensePeriod, string> = {
  WEEKLY: 'por semana',
  MONTHLY: 'por mes',
  QUARTERLY: 'por trimestre',
  YEARLY: 'por ano',
};

export interface ExpenseInput {
  id: string;
  name: string;
  amount: number;
  period: ExpensePeriod;
  /** Uma despesa desligada fica na lista mas nao conta. */
  active: boolean;
}

/** Quanto esta despesa custa num mes medio. */
export function monthlyAmount(amount: number, period: ExpensePeriod): number {
  if (!Number.isFinite(amount)) return 0;
  return amount * POR_MES[period];
}

/** O que a casa paga por mes, contando so as despesas ligadas. */
export function totalMonthly(expenses: ExpenseInput[]): number {
  return expenses
    .filter((e) => e.active)
    .reduce((acc, e) => acc + monthlyAmount(e.amount, e.period), 0);
}

/** Receita liquida a partir do que o cliente pagou. */
export function netFromGross(gross: number, vatRate: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(vatRate)) return 0;
  return gross / (1 + vatRate);
}

export interface FixedCostRate {
  /** A fracao a pôr em `Settings.fixedCostRate`. */
  rate: number;
  totalMonthly: number;
  netMonthlyRevenue: number;
  /**
   * As despesas fixas sozinhas comem a receita toda. Nao e um erro de conta:
   * e um negocio a perder dinheiro antes de comprar um unico insumo, e o
   * motor de precos nao tem preco nenhum que o salve.
   */
  impossible: boolean;
}

/**
 * A percentagem que o motor usa, ou `null` se ainda nao ha como a calcular.
 *
 * `null` e nao zero: zero significaria "esta casa nao tem custos fixos", que e
 * uma afirmacao, e aqui o que ha e falta de informacao.
 */
export function fixedCostRateFrom(
  totalMes: number,
  receitaLiquidaMes: number,
): FixedCostRate | null {
  if (!Number.isFinite(receitaLiquidaMes) || receitaLiquidaMes <= 0) return null;
  if (!Number.isFinite(totalMes) || totalMes < 0) return null;

  const rate = totalMes / receitaLiquidaMes;
  return {
    rate,
    totalMonthly: totalMes,
    netMonthlyRevenue: receitaLiquidaMes,
    impossible: rate >= 1,
  };
}

/**
 * Quanto e preciso faturar por mes para as despesas fixas caberem numa dada
 * percentagem.
 *
 * Serve para responder a pergunta ao contrario: "se eu quero que os fixos
 * sejam 20% da receita, quanto tenho de vender?". E o valor liquido; o de
 * menu e este mais IVA.
 */
export function revenueNeededFor(totalMes: number, rateAlvo: number): number | null {
  if (!Number.isFinite(rateAlvo) || rateAlvo <= 0) return null;
  if (!Number.isFinite(totalMes) || totalMes <= 0) return null;
  return totalMes / rateAlvo;
}
