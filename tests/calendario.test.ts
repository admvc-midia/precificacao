import { describe, expect, it } from 'vitest';

import { datasDoAno, nesimo, pascoa, somarDias } from '@/lib/calendario/datas';
import {
  diaNoAnoAnterior,
  eventosEntre,
  noAno,
  semanasDoMes,
  somarMeses,
  type Registo,
} from '@/lib/calendario/eventos';

const dia = (ano: number, chave: string) => datasDoAno(ano).find((d) => d.chave === chave)?.dia;

describe('datas conhecidas', () => {
  it('Pascoa certa em varios anos', () => {
    expect(pascoa(2024)).toBe('2024-03-31');
    expect(pascoa(2025)).toBe('2025-04-20');
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
    expect(pascoa(2038)).toBe('2038-04-25');
  });

  it('o que depende da Pascoa', () => {
    expect(dia(2026, 'carnaval')).toBe('2026-02-17');
    expect(dia(2026, 'sexta-santa')).toBe('2026-04-03');
    expect(dia(2026, 'corpo-de-deus')).toBe('2026-06-04');
  });

  it('domingos e quintas que mudam', () => {
    expect(nesimo(2026, 5, 0, 1)).toBe('2026-05-03');
    expect(dia(2026, 'dia-da-mae-pt')).toBe('2026-05-03');
    expect(dia(2026, 'dia-das-maes-br')).toBe('2026-05-10');
    expect(dia(2026, 'dia-dos-pais-br')).toBe('2026-08-09');
    expect(dia(2026, 'black-friday')).toBe('2026-11-27');
    expect(dia(2025, 'black-friday')).toBe('2025-11-28');
  });

  it('as mesmas festas em dias diferentes em Portugal e no Brasil', () => {
    expect(dia(2026, 'dia-da-crianca-pt')).toBe('2026-06-01');
    expect(dia(2026, 'criancas-br')).toBe('2026-10-12');
    expect(dia(2026, 'dia-do-pai-pt')).toBe('2026-03-19');
  });

  it('os 13 feriados nacionais de Portugal, e nenhum outro marcado como feriado', () => {
    const feriados = datasDoAno(2026).filter((d) => d.feriado);
    expect(feriados).toHaveLength(13);
    expect(feriados.every((d) => d.paises.includes('PT'))).toBe(true);
  });

  it('chaves unicas, e por ordem de dia', () => {
    const l = datasDoAno(2026);
    expect(new Set(l.map((d) => d.chave)).size).toBe(l.length);
    expect(l.map((d) => d.dia)).toEqual([...l.map((d) => d.dia)].sort());
  });

  it('somarDias atravessa meses e anos', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

function registo(r: Partial<Registo>): Registo {
  return { id: 'e1', knownKey: null, title: 'Evento', day: null, yearly: false, kind: 'EVENT', notes: null, planos: [], revisoes: [], ...r };
}

describe('eventosEntre', () => {
  it('a data conhecida leva o plano do dono, pela chave', () => {
    const plano = { id: 'p', recipeId: 'r', produto: 'Bolo de pote', acao: 'NONE' as const, qty: null, nota: null };
    const out = eventosEntre('2026-10-01', '2026-10-31', [registo({ id: 'k', knownKey: 'criancas-br', title: 'Dia das Crianças (BR)', yearly: true, planos: [plano] })]);
    const criancas = out.find((o) => o.chave === 'criancas-br')!;
    expect(criancas.dia).toBe('2026-10-12');
    expect(criancas.eventoId).toBe('k');
    expect(criancas.planos).toEqual([plano]);
    // A linha da data conhecida nao aparece uma segunda vez como evento do dono.
    expect(out.filter((o) => o.eventoId === 'k')).toHaveLength(1);
  });

  it('evento de uma vez so no seu dia; anual em todos os anos a partir do primeiro', () => {
    const regs = [
      registo({ id: 'uma', title: 'Feira', day: '2026-10-20' }),
      registo({ id: 'anual', title: 'Aniversario da loja', day: '2025-10-15', yearly: true }),
    ];
    const out = eventosEntre('2024-01-01', '2027-12-31', regs);
    expect(out.filter((o) => o.eventoId === 'uma').map((o) => o.dia)).toEqual(['2026-10-20']);
    expect(out.filter((o) => o.eventoId === 'anual').map((o) => o.dia)).toEqual(['2025-10-15', '2026-10-15', '2027-10-15']);
  });

  it('29 de fevereiro cai a 28 nos anos comuns', () => {
    expect(noAno('2024-02-29', 2025)).toBe('2025-02-28');
    expect(noAno('2024-02-29', 2028)).toBe('2028-02-29');
  });

  it('feriado primeiro dentro do mesmo dia', () => {
    const out = eventosEntre('2026-12-25', '2026-12-25', [registo({ title: 'Almoço da equipa', day: '2026-12-25', kind: 'TEAM' })]);
    expect(out[0].feriado).toBe(true);
    expect(out[1].titulo).toBe('Almoço da equipa');
  });

  it('o ano anterior de uma data conhecida e a mesma data, nao o mesmo dia do mes', () => {
    const [pascoa26] = eventosEntre('2026-04-05', '2026-04-05', []).filter((o) => o.chave === 'pascoa');
    expect(diaNoAnoAnterior(pascoa26)).toBe('2025-04-20');
    const [feira] = eventosEntre('2026-10-20', '2026-10-20', [registo({ day: '2026-10-20' })]).filter((o) => o.eventoId);
    expect(diaNoAnoAnterior(feira)).toBeNull();
  });
});

describe('grelha do mes', () => {
  it('semanas de segunda a domingo, a cobrir o mes todo', () => {
    const s = semanasDoMes('2026-10');
    expect(s[0][0]).toBe('2026-09-28'); // 1/10/2026 e quinta
    expect(s.every((w) => w.length === 7)).toBe(true);
    expect(s.flat()).toContain('2026-10-31');
    expect(s[s.length - 1][6]).toBe('2026-11-01');
  });

  it('somarMeses atravessa anos', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });
});
