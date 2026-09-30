import { describe, expect, it } from 'vitest';

import {
  fixedCostRateFrom,
  monthlyAmount,
  netFromGross,
  revenueNeededFor,
  totalMonthly,
  type ExpenseInput,
} from '@/lib/pricing/expenses';

const despesa = (
  id: string,
  amount: number,
  period: ExpenseInput['period'] = 'MONTHLY',
  active = true,
): ExpenseInput => ({ id, name: id, amount, period, active });

describe('periodicidade das despesas', () => {
  it('traz cada periodo para o mes', () => {
    expect(monthlyAmount(1200, 'MONTHLY')).toBeCloseTo(1200, 10);
    expect(monthlyAmount(3600, 'QUARTERLY')).toBeCloseTo(1200, 10);
    expect(monthlyAmount(14400, 'YEARLY')).toBeCloseTo(1200, 10);
  });

  it('a semana nao sao quatro por mes', () => {
    // Sao 52 semanas em 12 meses. Com 4, uma despesa semanal ficava ~8%
    // subestimada — e as despesas fixas sao precisamente o que nao se quer
    // subestimar.
    expect(monthlyAmount(100, 'WEEKLY')).toBeCloseTo(433.333, 3);
    expect(monthlyAmount(100, 'WEEKLY')).not.toBeCloseTo(400, 1);
  });

  it('soma so o que esta ligado', () => {
    const lista = [
      despesa('renda', 900),
      despesa('luz', 150),
      despesa('seguro', 600, 'YEARLY'),
      despesa('marketing', 300, 'MONTHLY', false),
    ];
    // 900 + 150 + 50 = 1100. Os 300 desligados nao entram.
    expect(totalMonthly(lista)).toBeCloseTo(1100, 10);
  });

  it('lista vazia da zero, nao rebenta', () => {
    expect(totalMonthly([])).toBe(0);
  });
});

describe('receita liquida', () => {
  it('tira o IVA do que o cliente pagou', () => {
    // 1130 com IVA de 13% sao 1000 liquidos.
    expect(netFromGross(1130, 0.13)).toBeCloseTo(1000, 6);
  });

  it('sem IVA, liquido e bruto', () => {
    expect(netFromGross(1000, 0)).toBeCloseTo(1000, 10);
  });
});

describe('percentagem de custos fixos', () => {
  it('sai da divisao pela receita liquida', () => {
    const r = fixedCostRateFrom(2200, 10000);
    expect(r).not.toBeNull();
    expect(r!.rate).toBeCloseTo(0.22, 10);
    expect(r!.impossible).toBe(false);
  });

  it('dividir pelo bruto daria uma percentagem menor do que a real', () => {
    // A armadilha: 2200 de despesas, 11300 faturados com IVA de 13%.
    const bruto = 11300;
    const liquido = netFromGross(bruto, 0.13);

    const certo = fixedCostRateFrom(2200, liquido)!.rate;
    const errado = fixedCostRateFrom(2200, bruto)!.rate;

    expect(certo).toBeCloseTo(0.22, 4);
    expect(errado).toBeCloseTo(0.1947, 4);
    // Subestimava os custos fixos em mais de dois pontos percentuais.
    expect(certo - errado).toBeGreaterThan(0.02);
  });

  it('sem receita nao ha percentagem — e isso e null, nao zero', () => {
    // Zero seria dizer "esta casa nao tem custos fixos". O que ha e falta de
    // informacao, que e coisa diferente.
    expect(fixedCostRateFrom(2200, 0)).toBeNull();
    expect(fixedCostRateFrom(2200, -1)).toBeNull();
    expect(fixedCostRateFrom(2200, Number.NaN)).toBeNull();
  });

  it('assinala quando as despesas comem a receita toda', () => {
    const r = fixedCostRateFrom(12000, 10000);
    expect(r!.impossible).toBe(true);
    expect(r!.rate).toBeCloseTo(1.2, 10);
  });

  it('despesas a zero sao uma resposta valida', () => {
    const r = fixedCostRateFrom(0, 10000);
    expect(r!.rate).toBe(0);
    expect(r!.impossible).toBe(false);
  });
});

describe('a pergunta ao contrario', () => {
  it('quanto e preciso faturar para os fixos caberem na percentagem', () => {
    // 2200 de despesas a caber em 20% pedem 11000 liquidos por mes.
    expect(revenueNeededFor(2200, 0.2)).toBeCloseTo(11000, 6);
  });

  it('nao responde ao impossivel', () => {
    expect(revenueNeededFor(2200, 0)).toBeNull();
    expect(revenueNeededFor(0, 0.2)).toBeNull();
  });
});
