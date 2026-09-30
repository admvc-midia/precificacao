/**
 * As contas da aba de Compras, sem base de dados: comparar um preco achado no
 * supermercado com o que a casa usa, saber quanto comprar para chegar ao
 * minimo, e o que entra no estoque ao fechar a lista.
 *
 * Importa-se dos dois lados: a comparacao corre no telemovel do comprador
 * enquanto ele escreve o preco, e a mesma funcao confere no servidor.
 */

import { toBase, type BaseUnit, type PurchaseUnit } from '@/lib/units';

export interface Embalagem {
  /** Preco da embalagem inteira. */
  price: number;
  packQty: number;
  packUnit: PurchaseUnit;
}

/** Preco por unidade base (grama, ml ou unidade). `null` se a embalagem e zero. */
export function precoPorBase(e: Embalagem): number | null {
  const base = toBase(e.packQty, e.packUnit);
  return base > 0 && Number.isFinite(e.price) ? e.price / base : null;
}

export interface Comparacao {
  /** Preco por unidade base do que se achou. */
  achado: number;
  /** Do preco em uso; `null` quando o insumo ainda nao tinha preco. */
  referencia: number | null;
  /** Fracao: -0,12 = 12% mais barato; 0,05 = 5% mais caro. */
  diferenca: number | null;
  veredicto: 'mais-barato' | 'igual' | 'mais-caro' | 'sem-referencia';
}

/**
 * Menos de 1% de diferenca conta como igual: arredondamentos de etiqueta nao
 * sao razao para mudar de loja.
 */
const MARGEM_IGUAL = 0.01;

export function compararPreco(achado: Embalagem, referenciaPorBase: number | null): Comparacao | null {
  const porBase = precoPorBase(achado);
  if (porBase === null) return null;
  if (referenciaPorBase === null || referenciaPorBase <= 0) {
    return { achado: porBase, referencia: null, diferenca: null, veredicto: 'sem-referencia' };
  }
  const diferenca = porBase / referenciaPorBase - 1;
  const veredicto =
    Math.abs(diferenca) < MARGEM_IGUAL ? 'igual' : diferenca < 0 ? 'mais-barato' : 'mais-caro';
  return { achado: porBase, referencia: referenciaPorBase, diferenca, veredicto };
}

export interface EstadoEstoque {
  stockBase: number;
  minStockBase: number | null;
  /** Gasto medio por dia, dos ultimos 30 dias. Zero se nao houve saidas. */
  gastoPorDia: number;
}

export interface LeituraEstoque {
  situacao: 'sem-estoque' | 'abaixo-do-minimo' | 'ok';
  /** Quantos dias o estoque dura ao ritmo recente. `null` sem historico. */
  dias: number | null;
}

/**
 * O que o comprador precisa de saber para decidir se leva mais: se esta em
 * falta, abaixo do minimo, e para quanto tempo chega.
 */
export function lerEstoque(e: EstadoEstoque): LeituraEstoque {
  const situacao =
    e.stockBase <= 0
      ? 'sem-estoque'
      : e.minStockBase !== null && e.minStockBase > 0 && e.stockBase <= e.minStockBase
        ? 'abaixo-do-minimo'
        : 'ok';
  const dias = e.gastoPorDia > 0 ? Math.max(0, e.stockBase) / e.gastoPorDia : null;
  return { situacao, dias };
}

/**
 * Embalagens para passar do estoque atual ao minimo. Zero quando nao ha
 * minimo ou ele ja esta coberto. Sempre inteiras: nao se compra meio pacote.
 */
export function embalagensParaMinimo(
  stockBase: number,
  minStockBase: number | null,
  e: Pick<Embalagem, 'packQty' | 'packUnit'>,
): number {
  if (!minStockBase || minStockBase <= 0) return 0;
  const falta = minStockBase - Math.max(0, stockBase);
  const tamanho = toBase(e.packQty, e.packUnit);
  if (falta <= 0 || tamanho <= 0) return 0;
  // A folga evita que 2,0000000001 embalagens virem 3 por ruido de virgula.
  return Math.ceil(falta / tamanho - 1e-9);
}

export interface ItemComprado extends Embalagem {
  ingredientId: string;
  ingredientName: string;
  packs: number;
  baseUnit: BaseUnit;
}

export interface EntradaDeCompra {
  ingredientId: string;
  qtyBase: number;
  /** Custo por unidade base, ao preco pago. */
  unitCost: number;
  note: string;
}

/**
 * O que entra no estoque ao fechar a lista: cada item comprado, ao preco
 * **pago** — e isso que acerta o custo medio, nao o preco que se esperava.
 *
 * Dois itens do mesmo insumo (duas lojas, dois tamanhos) entram como duas
 * entradas; o plano de movimentos pondera-as uma a uma.
 */
export function entradasDaCompra(itens: ItemComprado[], nomeLista: string): EntradaDeCompra[] {
  return itens
    .filter((i) => i.packs > 0)
    .map((i) => {
      const tamanho = toBase(i.packQty, i.packUnit, i.baseUnit);
      if (tamanho <= 0) throw new Error(`"${i.ingredientName}": embalagem sem tamanho.`);
      return {
        ingredientId: i.ingredientId,
        qtyBase: i.packs * tamanho,
        unitCost: i.price / tamanho,
        note: `${i.packs}x embalagem · compras "${nomeLista}"`,
      };
    });
}
