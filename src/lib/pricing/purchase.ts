/**
 * Lista de compras (Modulo 4).
 *
 * A explosao de insumos (`explodeIngredients`) responde "de quanto preciso".
 * Este modulo responde a pergunta que se faz no supermercado: "entao o que e
 * que eu compro, e quanto e que isso custa".
 *
 * As duas respostas nao sao a mesma, e a diferenca e a parte util:
 *
 *   - **Estoque.** So falta comprar o que nao se tem.
 *   - **Embalagem inteira.** Ninguem vende 0,4 de um pacote de 5 kg. Se
 *     faltam 2 kg, compram-se 5 e sobram 3 — e esses 3 kg sao dinheiro que
 *     sai hoje. O custo teorico do consumo e sempre menor que o custo real
 *     da compra, e a aplicacao mostra os dois.
 *   - **Fornecedor.** A lista sai dividida por loja, porque e assim que se
 *     faz a volta das compras.
 */

import { toBase, type BaseUnit } from '@/lib/units';
import { baseUnitOf } from '@/lib/units';
import { explodeIngredients, PricingError } from './cost';
import type { CostContext, IngredientInput } from './types';

export interface PurchaseLine {
  ingredient: IngredientInput;
  baseUnit: BaseUnit;
  /** Necessidade total, na unidade base e ja com o fator de correcao. */
  requiredBase: number;
  /** Estoque considerado. */
  stockBase: number;
  /** O que falta, na unidade base. Nunca negativo. */
  missingBase: number;
  /** Tamanho da embalagem de compra, na unidade base. */
  packSizeBase: number;
  /** Embalagens inteiras a comprar. */
  packsToBuy: number;
  /** O que de facto entra em casa: `packsToBuy x packSizeBase`. */
  purchasedBase: number;
  /** Sobra da compra, por nao existir fracao de embalagem. */
  leftoverBase: number;
  /** Custo real: embalagens inteiras ao preco de compra. */
  cost: number;
  /** Custo do que sera mesmo consumido. Sempre <= `cost`. */
  theoreticalCost: number;
}

export interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  lines: PurchaseLine[];
  total: number;
}

export interface PurchaseList {
  /** Todas as linhas, incluindo as que o estoque ja cobre. */
  lines: PurchaseLine[];
  /** Apenas o que precisa ser comprado, agrupado por fornecedor. */
  bySupplier: SupplierGroup[];
  /** Soma das embalagens inteiras a comprar. */
  totalCost: number;
  /** Soma do que sera consumido, se nao houvesse embalagem minima. */
  theoreticalCost: number;
  /** `totalCost - theoreticalCost`: o que fica em despensa. */
  leftoverCost: number;
  /** Linhas que o estoque atual ja cobre por inteiro. */
  coveredByStock: PurchaseLine[];
}

export interface DemandLine {
  recipeId: string;
  qty: number;
}

/**
 * Monta a lista de compras para uma demanda de producao.
 *
 * @param demand   quantas porcoes de cada produto se quer produzir
 * @param ctx      insumos e fichas carregados em memoria
 * @param options  `ignoreStock` trata tudo como se a despensa estivesse vazia,
 *                 util para orcamentar do zero.
 */
export function buildPurchaseList(
  demand: DemandLine[],
  ctx: CostContext,
  options: { ignoreStock?: boolean } = {},
): PurchaseList {
  const needed = explodeIngredients(demand, ctx);

  const lines: PurchaseLine[] = [];

  for (const [ingredientId, requiredBase] of needed) {
    const ingredient = ctx.ingredients.get(ingredientId);
    if (!ingredient) {
      throw new PricingError(`Insumo nao encontrado: ${ingredientId}`);
    }

    const packSizeBase = toBase(ingredient.purchaseQty, ingredient.purchaseUnit);
    if (packSizeBase <= 0) {
      throw new PricingError(
        `Insumo "${ingredient.name}": a quantidade de compra tem de ser maior que zero.`,
      );
    }

    const stockBase = options.ignoreStock ? 0 : (ingredient.stockBase ?? 0);
    const missingBase = Math.max(0, requiredBase - stockBase);

    // Embalagem inteira, sempre para cima. A tolerancia evita que um erro de
    // virgula flutuante (2.0000000001 pacotes) mande comprar um pacote a mais.
    const packsToBuy =
      missingBase > 0 ? Math.ceil(missingBase / packSizeBase - 1e-9) : 0;

    const purchasedBase = packsToBuy * packSizeBase;
    const unitPrice = ingredient.purchasePrice / packSizeBase;

    lines.push({
      ingredient,
      baseUnit: baseUnitOf(ingredient.purchaseUnit),
      requiredBase,
      stockBase,
      missingBase,
      packSizeBase,
      packsToBuy,
      purchasedBase,
      leftoverBase: Math.max(0, purchasedBase - missingBase),
      cost: packsToBuy * ingredient.purchasePrice,
      theoreticalCost: missingBase * unitPrice,
    });
  }

  // Ordem estavel e util: o que custa mais primeiro, depois por nome.
  lines.sort(
    (a, b) => b.cost - a.cost || a.ingredient.name.localeCompare(b.ingredient.name),
  );

  const toBuy = lines.filter((l) => l.packsToBuy > 0);
  const coveredByStock = lines.filter((l) => l.packsToBuy === 0);

  const groups = new Map<string, SupplierGroup>();
  for (const line of toBuy) {
    const id = line.ingredient.supplierId ?? null;
    const key = id ?? '__sem_fornecedor__';
    const group = groups.get(key) ?? {
      supplierId: id,
      supplierName: line.ingredient.supplierName ?? 'Sem fornecedor',
      lines: [],
      total: 0,
    };
    group.lines.push(line);
    group.total += line.cost;
    groups.set(key, group);
  }

  const bySupplier = [...groups.values()].sort((a, b) => {
    // "Sem fornecedor" fica sempre no fim: nao e uma loja onde se passa.
    if (a.supplierId === null) return 1;
    if (b.supplierId === null) return -1;
    return b.total - a.total;
  });

  const totalCost = toBuy.reduce((acc, l) => acc + l.cost, 0);
  const theoreticalCost = toBuy.reduce((acc, l) => acc + l.theoreticalCost, 0);

  return {
    lines,
    bySupplier,
    totalCost,
    theoreticalCost,
    leftoverCost: totalCost - theoreticalCost,
    coveredByStock,
  };
}

/**
 * Custo de produzir a demanda, medido pelas fichas tecnicas.
 *
 * E diferente do `totalCost` da lista de compras: este ignora estoque e
 * embalagem minima, e por isso e o numero que deve ser comparado com a
 * receita esperada. O `totalCost` e o desembolso de hoje.
 */
export function demandConsumptionCost(demand: DemandLine[], ctx: CostContext): number {
  const needed = explodeIngredients(demand, ctx);
  let total = 0;

  for (const [ingredientId, qtyBase] of needed) {
    const ingredient = ctx.ingredients.get(ingredientId);
    if (!ingredient) {
      throw new PricingError(`Insumo nao encontrado: ${ingredientId}`);
    }
    const packSizeBase = toBase(ingredient.purchaseQty, ingredient.purchaseUnit);
    if (packSizeBase > 0) {
      total += qtyBase * (ingredient.purchasePrice / packSizeBase);
    }
  }
  return total;
}
