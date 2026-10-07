import { describe, expect, it } from 'vitest';

import { desvioDeLisboa, intervaloDoMes, mesAtual, mesEmLisboa } from '@/lib/datas';

describe('meses em hora de Lisboa', () => {
  it('no verao Lisboa esta uma hora a frente; no inverno, igual a UTC', () => {
    expect(desvioDeLisboa(new Date('2026-08-01T12:00:00Z'))).toBe(60);
    expect(desvioDeLisboa(new Date('2026-12-01T12:00:00Z'))).toBe(0);
  });

  it('00:30 de 1 de agosto em Lisboa e agosto, apesar de em UTC ainda ser julho', () => {
    // O defeito que motivou isto: em UTC, esta entrega contava em julho.
    expect(mesEmLisboa(new Date('2026-07-31T23:30:00Z'))).toBe('2026-08');
    expect(mesEmLisboa(new Date('2026-07-31T22:59:00Z'))).toBe('2026-07');
  });

  it('no inverno, a fronteira e a meia-noite UTC', () => {
    expect(mesEmLisboa(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12');
    expect(mesEmLisboa(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });

  it('intervalo do mes: de meia-noite a meia-noite de Lisboa', () => {
    expect(intervaloDoMes('2026-08')).toEqual({
      start: new Date('2026-07-31T23:00:00Z'),
      end: new Date('2026-08-31T23:00:00Z'),
    });
    // Outubro muda de hora a meio: comeca no verao e acaba no inverno.
    expect(intervaloDoMes('2026-10')).toEqual({
      start: new Date('2026-09-30T23:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    });
    // Dezembro passa o ano.
    expect(intervaloDoMes('2026-12')).toEqual({
      start: new Date('2026-12-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('um instante cai sempre no intervalo do seu mes', () => {
    for (const iso of ['2026-03-29T00:30:00Z', '2026-03-31T23:30:00Z', '2026-10-25T01:30:00Z', '2026-06-15T12:00:00Z']) {
      const d = new Date(iso);
      const { start, end } = intervaloDoMes(mesEmLisboa(d));
      expect(d >= start && d < end, iso).toBe(true);
    }
  });

  it('mes atual', () => {
    expect(mesAtual(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10');
  });
});
