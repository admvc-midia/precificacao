import { describe, expect, it } from 'vitest';

/**
 * Um campo ausente e um campo vazio nao sao a mesma coisa.
 *
 * Isto testa a regra sozinha, sem base de dados. A action le cada campo so
 * quando ele vem no formulario; o que nao vem fica como esta. Sem essa
 * distincao, um pedido com dois campos zerava a configuracao inteira — o IVA,
 * os custos fixos, a taxa de cartao e a margem alvo — sem erro nenhum, porque
 * zero e um valor legitimo em todos eles.
 */
function presente(form: FormData, nome: string): boolean {
  return form.get(nome) !== null;
}

describe('campo ausente contra campo vazio', () => {
  it('ausente e ausente', () => {
    const f = new FormData();
    f.set('currency', 'EUR');
    expect(presente(f, 'currency')).toBe(true);
    expect(presente(f, 'vatRate')).toBe(false);
    expect(presente(f, 'fixedCostRate')).toBe(false);
  });

  it('vazio esta presente — apagar uma caixa quer dizer zero', () => {
    const f = new FormData();
    f.set('vatRate', '');
    expect(presente(f, 'vatRate')).toBe(true);
  });

  it('o zero explicito conta', () => {
    const f = new FormData();
    f.set('fixedCostRate', '0');
    expect(presente(f, 'fixedCostRate')).toBe(true);
  });

  it('o formulario do ecra traz tudo, e por isso nunca notou o problema', () => {
    const doEcra = new FormData();
    for (const campo of [
      'businessName',
      'currency',
      'vatRate',
      'vatMode',
      'fixedCostRate',
      'cardFeeRate',
      'targetCmv',
      'targetMargin',
      'rounding',
    ]) {
      doEcra.set(campo, '');
    }
    for (const campo of ['vatRate', 'fixedCostRate', 'targetMargin']) {
      expect(presente(doEcra, campo)).toBe(true);
    }

    // O pedido que causou o estrago trazia dois campos.
    const parcial = new FormData();
    parcial.set('businessName', '');
    parcial.set('currency', 'EUR');
    for (const campo of ['vatRate', 'fixedCostRate', 'cardFeeRate', 'targetMargin']) {
      expect(presente(parcial, campo)).toBe(false);
    }
  });
});
