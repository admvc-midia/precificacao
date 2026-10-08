/**
 * O conteudo de cada lista exportada, e a copia completa.
 *
 * As listas em CSV sao para ler e trabalhar no Excel: nomes em vez de ids,
 * quilos em vez de gramas, rotulos em portugues. A copia completa e o
 * contrario — todas as tabelas tal como estao na base, para nada se perder.
 */

import { MODELOS } from '@/generated/modelo';
import { prisma } from '@/lib/db';
import { num, numOrNull } from '@/lib/mappers';
import { ALLERGEN_LABEL, type Allergen } from '@/lib/pricing/allergens';
import { CATEGORY_LABEL, PERIOD_LABEL, type ExpensePeriod } from '@/lib/pricing/expenses';
import { PAGAMENTO_LABEL, STATUS_LABEL } from '@/lib/pricing/encomendas';
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

/**
 * Uma linha por produto de cada encomenda. A entrega sai como texto
 * ("2026-10-08 15:30"): e hora de Lisboa guardada como UTC, e um Date
 * passaria pelo fuso do Excel.
 */
async function encomendas() {
  const rows = await prisma.customerOrderLine.findMany({
    include: {
      recipe: { select: { name: true } },
      order: {
        include: {
          customer: { select: { name: true, phone: true } },
          channel: { select: { name: true } },
        },
      },
    },
    orderBy: [{ order: { number: 'desc' } }, { id: 'asc' }],
  });
  return montarCsv(
    [
      'Encomenda',
      'Entrega',
      'Estado',
      'Entregue em',
      'Cliente',
      'Telefone',
      'Canal',
      'Produto',
      'Quantidade',
      'Preco unitario',
      'Preco de tabela',
      'Total',
      'Pago',
      'Forma de pagamento',
    ],
    rows.map((l) => {
      const e = l.order;
      return [
        e.number,
        e.dueAt.toISOString().slice(0, 16).replace('T', ' '),
        STATUS_LABEL[e.status],
        e.deliveredAt,
        e.customer?.name,
        e.customer?.phone,
        e.channel?.name,
        l.recipe.name,
        num(l.qty),
        num(l.unitPrice),
        numOrNull(l.listPrice),
        num(l.qty) * num(l.unitPrice),
        e.paid,
        e.paymentMethod ? PAGAMENTO_LABEL[e.paymentMethod] : null,
      ];
    }),
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
  encomendas,
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
 * copia no dia em que entra no schema. (`MODELOS` e escrito em cada
 * `prisma generate` por `tools/gerador-modelo.mjs`.)
 */
export function tabelasDoSchema(): string[] {
  return MODELOS.map((m) => m.name);
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

/**
 * Campos que nunca saem na copia.
 *
 * A copia vai para o OneDrive e pode ser descarregada pelo dono: e um ficheiro
 * que anda por ai. Os hashes das palavras-passe nao tem nada que fazer nele —
 * repor uma copia nunca precisaria deles (as pessoas definiam palavras-passe
 * novas), e fora da base sao um alvo para quem os tente adivinhar.
 *
 * Alem da lista, qualquer campo com nome de segredo fica de fora: um campo
 * novo `apiToken` nao entra na copia so porque alguem se esqueceu desta lista.
 */
const CAMPOS_FORA: Record<string, string[]> = { User: ['passwordHash'] };
const PARECE_SEGREDO = /password|hash|token|secret/i;

export function camposFora(modelo: string): string[] {
  const doModelo = MODELOS.find((m) => m.name === modelo);
  const porNome = (doModelo?.fields ?? []).map((f) => f.name).filter((n) => PARECE_SEGREDO.test(n));
  return [...new Set([...(CAMPOS_FORA[modelo] ?? []), ...porNome])];
}

export async function copiaCompleta(): Promise<CopiaCompleta> {
  const cliente = prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>;
  const tabelas: Record<string, unknown[]> = {};
  // Uma de cada vez: com o pooler em modo sessao ha poucas ligacoes, e isto
  // nao tem pressa.
  for (const modelo of tabelasDoSchema()) {
    const fora = camposFora(modelo);
    const linhas = await cliente[acessor(modelo)].findMany();
    // Tira depois de ler, e nao com `omit` na consulta: no Prisma 5 o `omit`
    // ainda e experimental. O efeito no ficheiro e o mesmo.
    tabelas[modelo] =
      fora.length === 0
        ? linhas
        : linhas.map((l) =>
            Object.fromEntries(Object.entries(l as Record<string, unknown>).filter(([k]) => !fora.includes(k))),
          );
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
