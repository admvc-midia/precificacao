/**
 * O conteudo de cada lista exportada, e a copia completa.
 *
 * As listas em CSV sao para ler e trabalhar no Excel: nomes em vez de ids,
 * quilos em vez de gramas, rotulos em portugues. A copia completa e o
 * contrario — todas as tabelas tal como estao na base, para nada se perder.
 */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { num, numOrNull } from '@/lib/mappers';
import { ALLERGEN_LABEL, type Allergen } from '@/lib/pricing/allergens';
import { CATEGORY_LABEL, PERIOD_LABEL, type ExpensePeriod } from '@/lib/pricing/expenses';
import { MOVEMENT_LABEL } from '@/lib/pricing/stock';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes } from '@/lib/queries';
import {
  DISPLAY_UNIT_LABEL,
  displayFactor,
  toBase,
  toDisplay,
  UNIT_LABEL,
  type BaseUnit,
  type PurchaseUnit,
} from '@/lib/units';
import { montarCsv, type Celula } from './csv';
import type { ListaId } from './listas';

import pkg from '../../../package.json';

const CATEGORIA_INSUMO: Record<string, string> = { FOOD: 'Alimento', PACKAGING: 'Embalagem' };
const TIPO_FICHA: Record<string, string> = { PRODUCT: 'Produto', BASE: 'Preparacao base' };
const MODO_PRECO: Record<string, string> = {
  TARGET_CMV: 'CMV alvo',
  TARGET_MARGIN: 'Margem alvo',
  MANUAL: 'Preco manual',
};

/** Preco por kg, L ou unidade de uma embalagem: 3,45 EUR por 0,5 kg -> 6,9. */
function precoPorUnidade(preco: number, qty: number, unit: PurchaseUnit, base: BaseUnit) {
  const emExibicao = toDisplay(toBase(qty, unit), base);
  return emExibicao > 0 ? preco / emExibicao : null;
}

/** Duas casas: o motor calcula com todas, mas 30,000537 % so atrapalha a ler. */
function r2(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v * 100) / 100;
}

function pct(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : r2(v * 100);
}

async function insumos() {
  const rows = await prisma.ingredient.findMany({
    include: { supplier: { select: { name: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return montarCsv(
    [
      'Insumo',
      'Tipo',
      'Fornecedor',
      'Preco da embalagem',
      'Embalagem',
      'Unidade da embalagem',
      'Preco por kg/L/un',
      'Fator de correcao',
      'Estoque',
      'Estoque minimo',
      'Unidade do estoque',
      'Custo medio por kg/L/un',
      'Alergenios',
      'Alergenios revistos',
      'Codigo (SKU)',
      'Notas',
    ],
    rows.map((r) => {
      const base = r.baseUnit;
      const min = numOrNull(r.minStockBase);
      return [
        r.name,
        CATEGORIA_INSUMO[r.category],
        r.supplier?.name,
        num(r.purchasePrice),
        num(r.purchaseQty),
        UNIT_LABEL[r.purchaseUnit],
        precoPorUnidade(num(r.purchasePrice), num(r.purchaseQty), r.purchaseUnit, base),
        num(r.correctionFactor),
        toDisplay(num(r.stockBase), base),
        min === null ? null : toDisplay(min, base),
        DISPLAY_UNIT_LABEL[base],
        num(r.avgCostBase) * displayFactor(base),
        r.allergens.map((a) => ALLERGEN_LABEL[a as Allergen]).join(', '),
        r.allergensReviewed,
        r.sku,
        r.notes,
      ];
    }),
  );
}

async function fornecedores() {
  const rows = await prisma.supplier.findMany({
    include: { _count: { select: { offers: true } } },
    orderBy: { name: 'asc' },
  });
  return montarCsv(
    ['Fornecedor', 'Morada', 'Telefone', 'Site', 'Insumos com preco', 'Notas'],
    rows.map((r) => [r.name, r.address, r.phone, r.url, r._count.offers, r.notes]),
  );
}

async function ofertas() {
  const rows = await prisma.supplierOffer.findMany({
    include: {
      ingredient: { select: { name: true, baseUnit: true } },
      supplier: { select: { name: true } },
    },
    orderBy: [{ ingredient: { name: 'asc' } }, { purchasePrice: 'asc' }],
  });
  return montarCsv(
    [
      'Insumo',
      'Fornecedor',
      'Preco da embalagem',
      'Embalagem',
      'Unidade da embalagem',
      'Preco por kg/L/un',
      'Em uso',
      'Ativa',
      'Codigo (SKU)',
      'Notas',
    ],
    rows.map((r) => [
      r.ingredient.name,
      r.supplier?.name ?? 'Sem fornecedor',
      num(r.purchasePrice),
      num(r.purchaseQty),
      UNIT_LABEL[r.purchaseUnit],
      precoPorUnidade(
        num(r.purchasePrice),
        num(r.purchaseQty),
        r.purchaseUnit,
        r.ingredient.baseUnit,
      ),
      r.inUse,
      r.active,
      r.sku,
      r.notes,
    ]),
  );
}

async function fichas() {
  const rows = await prisma.recipe.findMany({
    include: {
      items: {
        include: {
          ingredient: { select: { name: true } },
          childRecipe: { select: { name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      packaging: { select: { name: true } },
      deliveryPackaging: { select: { name: true } },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });

  const linhas: Celula[][] = [];
  for (const r of rows) {
    const comum: Celula[] = [
      r.name,
      TIPO_FICHA[r.kind],
      toDisplay(num(r.yieldQty), r.yieldUnit),
      DISPLAY_UNIT_LABEL[r.yieldUnit],
      r.packaging?.name,
      r.deliveryPackaging?.name,
    ];
    // Uma ficha ainda sem ingredientes tambem aparece, senao sumia da folha.
    if (r.items.length === 0) linhas.push([...comum, null, null, null, null, null]);
    for (const i of r.items) {
      linhas.push([
        ...comum,
        i.ingredient?.name ?? i.childRecipe?.name,
        i.childRecipeId ? 'Preparacao' : 'Insumo',
        num(i.qty),
        UNIT_LABEL[i.unit],
        i.notes,
      ]);
    }
  }
  return montarCsv(
    [
      'Ficha',
      'Tipo',
      'Rendimento',
      'Unidade do rendimento',
      'Embalagem',
      'Embalagem de entrega',
      'Ingrediente',
      'Tipo de ingrediente',
      'Quantidade',
      'Unidade',
      'Notas',
    ],
    linhas,
  );
}

async function precos() {
  const { recipes, settings, channels } = await getCostedRecipes();
  const canal = referenceChannel(channels);
  const linhas = recipes
    .filter((r) => r.kind === 'PRODUCT')
    .map((r): Celula[] => {
      const res = priceForRecipe(r, canal, settings);
      const ok = res?.feasible ?? false;
      const aviso = r.error ?? (res && !res.feasible ? res.warnings.join(' ') : null);
      return [
        r.name,
        MODO_PRECO[r.pricingMode],
        r2(r.cost?.productCost),
        ok ? r2(res!.price) : null,
        ok ? pct(res!.cmv) : null,
        ok ? pct(res!.netMargin) : null,
        ok ? r2(res!.profit) : null,
        aviso,
      ];
    });
  return montarCsv(
    [
      'Produto',
      'Modo',
      'Custo do produto',
      `Preco (${canal?.name ?? 'sem canal'})`,
      'CMV (%)',
      'Margem liquida (%)',
      'Lucro por unidade',
      'Aviso',
    ],
    linhas,
  );
}

async function movimentos() {
  const rows = await prisma.stockMovement.findMany({
    include: {
      ingredient: { select: { name: true, baseUnit: true } },
      order: { select: { name: true } },
    },
    orderBy: { occurredAt: 'desc' },
  });
  return montarCsv(
    [
      'Data',
      'Insumo',
      'Movimento',
      'Quantidade',
      'Unidade',
      'Custo por kg/L/un',
      'Valor',
      'Producao',
      'Nota',
    ],
    rows.map((r) => {
      const base = r.ingredient.baseUnit;
      return [
        r.occurredAt,
        r.ingredient.name,
        MOVEMENT_LABEL[r.kind],
        toDisplay(num(r.qtyBase), base),
        DISPLAY_UNIT_LABEL[base],
        num(r.unitCost) * displayFactor(base),
        num(r.value),
        r.order?.name,
        r.note,
      ];
    }),
  );
}

async function vendas() {
  const rows = await prisma.salesRecord.findMany({
    include: { recipe: { select: { name: true } } },
    orderBy: [{ period: 'desc' }, { recipe: { name: 'asc' } }],
  });
  return montarCsv(
    ['Mes', 'Produto', 'Quantidade', 'Faturacao'],
    rows.map((r) => [r.period, r.recipe.name, num(r.qty), numOrNull(r.revenue)]),
  );
}

async function despesas() {
  const rows = await prisma.expense.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return montarCsv(
    ['Despesa', 'Categoria', 'Valor', 'Periodicidade', 'Ativa', 'Notas'],
    rows.map((r) => [
      r.name,
      CATEGORY_LABEL[r.category],
      num(r.amount),
      PERIOD_LABEL[r.period as ExpensePeriod],
      r.active,
      r.notes,
    ]),
  );
}

const GERADORES: Record<ListaId, () => Promise<string>> = {
  insumos,
  fornecedores,
  ofertas,
  fichas,
  precos,
  movimentos,
  vendas,
  despesas,
};

export function gerarLista(id: ListaId): Promise<string> {
  return GERADORES[id]();
}

// ---------------------------------------------------------------------------
// Copia completa
// ---------------------------------------------------------------------------

/**
 * Os nomes de todas as tabelas, lidos do proprio schema.
 *
 * Uma lista escrita a mao ja falhou uma vez: o `dump-dados.mts` antigo nao
 * tinha as despesas, e ninguem deu por isso. Assim, uma tabela nova entra na
 * copia no dia em que entra no schema.
 */
export function tabelasDoSchema(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.name);
}

function acessor(modelo: string): string {
  return modelo.charAt(0).toLowerCase() + modelo.slice(1);
}

export interface CopiaCompleta {
  app: 'precificaragao';
  versao: string;
  gravadoEm: string;
  contagem: Record<string, number>;
  tabelas: Record<string, unknown[]>;
}

export async function copiaCompleta(): Promise<CopiaCompleta> {
  const cliente = prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>;
  const tabelas: Record<string, unknown[]> = {};
  // Uma de cada vez: com o pooler em modo sessao ha poucas ligacoes, e isto
  // nao tem pressa.
  for (const modelo of tabelasDoSchema()) {
    tabelas[modelo] = await cliente[acessor(modelo)].findMany();
  }
  return {
    app: 'precificaragao',
    versao: pkg.version,
    gravadoEm: new Date().toISOString(),
    contagem: Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.length])),
    tabelas,
  };
}

/** `Decimal` ja se serializa como texto (sem perder casas); `Date` como ISO. */
export function copiaEmJson(copia: CopiaCompleta): string {
  return JSON.stringify(copia, null, 2);
}
