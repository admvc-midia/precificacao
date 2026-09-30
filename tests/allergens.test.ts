import { describe, expect, it } from 'vitest';

import {
  ALLERGENS,
  ALLERGEN_HINT,
  ALLERGEN_LABEL,
  collectAllergens,
  countUnreviewed,
  type AllergenSource,
} from '@/lib/pricing/allergens';

const insumo = (
  name: string,
  allergens: AllergenSource['allergens'],
  reviewed = true,
  category: AllergenSource['category'] = 'FOOD',
): AllergenSource => ({ ingredientId: name, name, category, allergens, reviewed });

describe('a lista do Anexo II', () => {
  it('tem os catorze', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS).size).toBe(14);
  });

  it('todos tem rotulo e explicacao', () => {
    for (const a of ALLERGENS) {
      expect(ALLERGEN_LABEL[a]).toBeTruthy();
      expect(ALLERGEN_HINT[a]).toBeTruthy();
    }
  });

  it('amendoim e frutos de casca rija sao coisas diferentes', () => {
    // Confundi-los e um erro classico, e com consequencias: sao alergias
    // distintas e o regulamento trata-os em alineas separadas.
    expect(ALLERGENS).toContain('AMENDOINS');
    expect(ALLERGENS).toContain('FRUTOS_CASCA_RIJA');
    expect(ALLERGEN_HINT.AMENDOINS).toMatch(/nao e fruto de casca rija/i);
  });
});

describe('juntar os alergenios de uma ficha', () => {
  it('soma os dos insumos, sem repetir', () => {
    const r = collectAllergens([
      insumo('Farinha', ['GLUTEN']),
      insumo('Ovo', ['OVOS']),
      insumo('Manteiga', ['LEITE']),
      insumo('Leite condensado', ['LEITE']),
    ]);

    expect(r.present).toEqual(['OVOS', 'LEITE', 'GLUTEN'].sort((a, b) =>
      ALLERGENS.indexOf(a as never) - ALLERGENS.indexOf(b as never),
    ));
    expect(r.by.LEITE).toEqual(['Leite condensado', 'Manteiga']);
    expect(r.complete).toBe(true);
  });

  it('respeita a ordem do Anexo II', () => {
    const r = collectAllergens([
      insumo('Sesamo', ['SESAMO']),
      insumo('Farinha', ['GLUTEN']),
      insumo('Ovo', ['OVOS']),
    ]);
    // Gluten e o primeiro do anexo, sesamo o decimo primeiro.
    expect(r.present).toEqual(['GLUTEN', 'OVOS', 'SESAMO']);
  });

  it('um insumo por verificar e duvida, nao ausencia', () => {
    // O caso que isto existe para evitar: a ficha dizer "sem alergenios"
    // porque ninguem preencheu nada.
    const r = collectAllergens([
      insumo('Farinha', [], false),
      insumo('Ovo', [], false),
    ]);

    expect(r.present).toEqual([]);
    expect(r.unreviewed).toEqual(['Farinha', 'Ovo']);
    expect(r.complete).toBe(false);
  });

  it('verificado e sem nada e uma resposta, e diferente', () => {
    const r = collectAllergens([insumo('Acucar', []), insumo('Agua', [])]);
    expect(r.present).toEqual([]);
    expect(r.unreviewed).toEqual([]);
    // Aqui sim: alguem olhou e disse que nao tem.
    expect(r.complete).toBe(true);
  });

  it('um por verificar chega para a lista deixar de estar fechada', () => {
    const r = collectAllergens([
      insumo('Farinha', ['GLUTEN']),
      insumo('Corante', [], false),
    ]);
    expect(r.present).toEqual(['GLUTEN']);
    expect(r.unreviewed).toEqual(['Corante']);
    // A lista dos presentes passa a ser um minimo, nao um total.
    expect(r.complete).toBe(false);
  });

  it('embalagens nao entram', () => {
    const r = collectAllergens([
      insumo('Farinha', ['GLUTEN']),
      insumo('Caixa de cartao', [], false, 'PACKAGING'),
    ]);
    expect(r.present).toEqual(['GLUTEN']);
    // Uma caixa por verificar nao poe a ficha em duvida.
    expect(r.unreviewed).toEqual([]);
    expect(r.complete).toBe(true);
  });

  it('o mesmo insumo por dois caminhos conta uma vez', () => {
    // Manteiga direta na ficha e manteiga dentro do brigadeiro.
    const r = collectAllergens([
      { ...insumo('Manteiga', ['LEITE']), via: [] },
      { ...insumo('Manteiga', ['LEITE']), via: ['Brigadeiro'] },
    ]);
    expect(r.by.LEITE).toEqual(['Manteiga']);
  });

  it('ficha vazia nao rebenta', () => {
    const r = collectAllergens([]);
    expect(r.present).toEqual([]);
    expect(r.complete).toBe(true);
  });
});

describe('contar o que falta verificar', () => {
  it('conta so os alimentares', () => {
    expect(
      countUnreviewed([
        { category: 'FOOD', reviewed: false },
        { category: 'FOOD', reviewed: true },
        { category: 'PACKAGING', reviewed: false },
      ]),
    ).toBe(1);
  });
});
