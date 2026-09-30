/**
 * Alergenios de uma ficha tecnica, juntados a partir dos insumos.
 *
 * ---------------------------------------------------------------------------
 * A DISTINCAO QUE FAZ ISTO VALER ALGUMA COISA
 * ---------------------------------------------------------------------------
 * Um produto que leva farinha e ovos mostra "sem alergenios" enquanto ninguem
 * tiver preenchido os insumos. Isso nao e informacao em falta: e informacao
 * errada, e a unica que pode mandar alguem para o hospital.
 *
 * Por isso cada insumo tem dois campos e nao um. A lista diz o que ele contem;
 * a marca de verificado diz se alguem olhou. Um insumo por verificar entra no
 * resultado como **duvida**, nunca como ausencia — e a ficha mostra os dois
 * numeros separados, para a diferenca ser impossivel de nao ver.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO NAO E
 * ---------------------------------------------------------------------------
 * Nao e uma declaracao legal. O Regulamento (UE) 1169/2011 obriga a declarar
 * os alergenios dos ingredientes usados de proposito, e quem responde por essa
 * declaracao e quem a assina — nao um programa que soma listas. Vestigios por
 * contaminacao cruzada, que o regulamento trata a parte e nao obriga, nao sao
 * modelados aqui de todo: fingir que eram seria pior do que a sua ausencia.
 *
 * Sem React, sem Prisma, como o resto de `lib/pricing`.
 */

export type Allergen =
  | 'GLUTEN'
  | 'CRUSTACEOS'
  | 'OVOS'
  | 'PEIXES'
  | 'AMENDOINS'
  | 'SOJA'
  | 'LEITE'
  | 'FRUTOS_CASCA_RIJA'
  | 'AIPO'
  | 'MOSTARDA'
  | 'SESAMO'
  | 'SULFITOS'
  | 'TREMOCO'
  | 'MOLUSCOS';

/** A ordem do Anexo II, que e a que aparece nas ementas e nos rotulos. */
export const ALLERGENS: Allergen[] = [
  'GLUTEN',
  'CRUSTACEOS',
  'OVOS',
  'PEIXES',
  'AMENDOINS',
  'SOJA',
  'LEITE',
  'FRUTOS_CASCA_RIJA',
  'AIPO',
  'MOSTARDA',
  'SESAMO',
  'SULFITOS',
  'TREMOCO',
  'MOLUSCOS',
];

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  GLUTEN: 'Gluten',
  CRUSTACEOS: 'Crustaceos',
  OVOS: 'Ovos',
  PEIXES: 'Peixes',
  AMENDOINS: 'Amendoins',
  SOJA: 'Soja',
  LEITE: 'Leite',
  FRUTOS_CASCA_RIJA: 'Frutos de casca rija',
  AIPO: 'Aipo',
  MOSTARDA: 'Mostarda',
  SESAMO: 'Sesamo',
  SULFITOS: 'Sulfitos',
  TREMOCO: 'Tremoco',
  MOLUSCOS: 'Moluscos',
};

/** O que o regulamento diz, para quem preenche nao ter de adivinhar. */
export const ALLERGEN_HINT: Record<Allergen, string> = {
  GLUTEN: 'Trigo, centeio, cevada, aveia, espelta, kamut e derivados.',
  CRUSTACEOS: 'Camarao, lagosta, caranguejo, lagostim.',
  OVOS: 'De qualquer ave, e derivados.',
  PEIXES: 'Inclui gelatina e caldos de peixe.',
  AMENDOINS: 'Amendoim e derivados. Nao e fruto de casca rija.',
  SOJA: 'Grao, farinha, lecitina, molho.',
  LEITE: 'Inclui lactose, manteiga, natas, queijo e iogurte.',
  FRUTOS_CASCA_RIJA:
    'Amendoas, avelas, nozes, cajus, pecans, castanhas do Brasil, pistacios, macadamias.',
  AIPO: 'Raiz, talo, folhas e sementes.',
  MOSTARDA: 'Grao, po e molho.',
  SESAMO: 'Sementes e oleo.',
  SULFITOS: 'Acima de 10 mg/kg. Comum em vinho, frutos secos e conservas.',
  TREMOCO: 'Grao e farinha.',
  MOLUSCOS: 'Amejoas, mexilhoes, lulas, polvo, caracois.',
};

export interface AllergenSource {
  ingredientId: string;
  name: string;
  /** PACKAGING nao entra: uma caixa de cartao nao tem alergenios. */
  category: 'FOOD' | 'PACKAGING';
  /** Por onde se chegou a este insumo, para a ficha dizer onde ele entra. */
  via?: string[];
  allergens: Allergen[];
  reviewed: boolean;
}

export interface AllergenReport {
  /** Os que estao declarados em pelo menos um insumo, na ordem do Anexo II. */
  present: Allergen[];
  /** Que insumos trazem cada um. */
  by: Record<string, string[]>;
  /** Insumos alimentares que ninguem ainda verificou. */
  unreviewed: string[];
  /**
   * Se a lista se pode mostrar como estando completa.
   *
   * Falso enquanto houver um insumo por verificar — e nessa altura a lista
   * dos presentes e um minimo, nao um total.
   */
  complete: boolean;
}

/**
 * Junta os alergenios dos insumos de uma ficha.
 *
 * Recebe as linhas ja achatadas (`flattenRecipe`), por isso as sub-receitas
 * ja vem resolvidas: um insumo que entra por dentro de uma preparacao base
 * conta como qualquer outro, que e o que a lei quer.
 */
export function collectAllergens(fontes: AllergenSource[]): AllergenReport {
  const by: Record<string, string[]> = {};
  const unreviewed: string[] = [];

  for (const f of fontes) {
    // Embalagens nao entram. O regulamento fala do genero alimenticio.
    if (f.category === 'PACKAGING') continue;

    if (!f.reviewed) {
      if (!unreviewed.includes(f.name)) unreviewed.push(f.name);
      // Um insumo por verificar nao contribui com alergenios nem com a
      // ausencia deles: contribui com duvida, que e o que `complete` diz.
      continue;
    }

    for (const a of f.allergens) {
      (by[a] ??= []).push(f.name);
    }
  }

  for (const a of Object.keys(by)) {
    by[a] = [...new Set(by[a])].sort((x, y) => x.localeCompare(y, 'pt'));
  }

  return {
    present: ALLERGENS.filter((a) => by[a]?.length),
    by,
    unreviewed: unreviewed.sort((a, b) => a.localeCompare(b, 'pt')),
    complete: unreviewed.length === 0,
  };
}

/** Quantos insumos alimentares ainda ninguem verificou, numa lista qualquer. */
export function countUnreviewed(
  insumos: Array<{ category: 'FOOD' | 'PACKAGING'; reviewed: boolean }>,
): number {
  return insumos.filter((i) => i.category === 'FOOD' && !i.reviewed).length;
}
