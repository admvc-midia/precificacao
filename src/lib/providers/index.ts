/**
 * Registo de providers de preco e utilitarios de comparacao.
 * Ver `types.ts` para a explicacao do desenho.
 */

import { parseDecimal, parseQty } from '@/lib/money';
import { toBase, type PurchaseUnit } from '@/lib/units';
import type {
  PriceProvider,
  PriceQuoteResult,
  QuoteComparison,
  QuoteSource,
} from './types';

export * from './types';

// ---------------------------------------------------------------------------
// Provider: CSV
// ---------------------------------------------------------------------------

/**
 * Le uma lista de precos em CSV. Formato esperado (cabecalho obrigatorio):
 *
 *   nome;preco;quantidade;unidade;fonte;url
 *   Carne picada 20%;12,50;5;KG;CONTINENTE;https://...
 *
 * Aceita `;` ou `,` como separador de coluna e virgula decimal — e o que sai
 * do Excel em pt-PT.
 */
export function parsePriceCsv(text: string): PriceQuoteResult[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = countOf(lines[0], ';') >= countOf(lines[0], ',') ? ';' : ',';
  const header = splitRow(lines[0], delimiter).map((h) => h.toLowerCase().trim());

  const idx = {
    name: findCol(header, ['nome', 'produto', 'name']),
    price: findCol(header, ['preco', 'preço', 'price', 'valor']),
    qty: findCol(header, ['quantidade', 'qtd', 'qty', 'tamanho']),
    unit: findCol(header, ['unidade', 'unit', 'un']),
    source: findCol(header, ['fonte', 'source', 'loja']),
    url: findCol(header, ['url', 'link']),
  };

  if (idx.name < 0 || idx.price < 0) {
    throw new Error(
      'CSV invalido: sao obrigatorias pelo menos as colunas "nome" e "preco".',
    );
  }

  const out: PriceQuoteResult[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitRow(line, delimiter);
    const label = cells[idx.name]?.trim();
    if (!label) continue;

    const price = csvNumber(cells[idx.price]);
    const qty = idx.qty >= 0 ? csvQty(cells[idx.qty]) || 1 : 1;
    const unit = normalizeUnit(idx.unit >= 0 ? cells[idx.unit] : 'UN');
    const source = normalizeSource(idx.source >= 0 ? cells[idx.source] : 'CSV');

    if (!Number.isFinite(price) || price <= 0) continue;

    out.push({
      source,
      label,
      price,
      qty,
      unit,
      url: idx.url >= 0 ? cells[idx.url]?.trim() || undefined : undefined,
      capturedAt: new Date(),
    });
  }
  return out;
}

export function csvProvider(csvText: string): PriceProvider {
  let cache: PriceQuoteResult[] | null = null;

  return {
    source: 'CSV',
    name: 'Lista em CSV',
    isConfigured: () => csvText.trim().length > 0,
    async search(term: string) {
      cache ??= parsePriceCsv(csvText);
      const needle = normalizeText(term);
      if (!needle) return cache;
      return cache.filter((q) => normalizeText(q.label).includes(needle));
    },
  };
}

// ---------------------------------------------------------------------------
// Importacao de insumos
// ---------------------------------------------------------------------------

export interface IngredientCsvRow {
  name: string;
  purchasePrice: number;
  purchaseQty: number;
  unit: PurchaseUnit;
  category: 'FOOD' | 'PACKAGING';
  supplierName: string | null;
  /** Fator de correcao. 1 quando nao ha perda. */
  correctionFactor: number;
  stockBase: number;
  /** Numero da linha no ficheiro, para o utilizador saber onde corrigir. */
  line: number;
}

export interface IngredientCsvResult {
  rows: IngredientCsvRow[];
  /** Linhas recusadas, com a razao. */
  errors: Array<{ line: number; reason: string }>;
}

/**
 * Le uma lista de insumos em CSV.
 *
 * Cabecalho aceite (a ordem nao importa, os acentos tambem nao):
 *
 *   nome;preco;quantidade;unidade;fornecedor;categoria;perda;estoque
 *
 * Obrigatorias sao `nome`, `preco` e `quantidade`. `categoria` aceita
 * "alimento"/"embalagem"; `perda` e a percentagem (20 = 20%).
 *
 * Linhas mas nao interrompem a importacao: sao devolvidas em `errors` para o
 * utilizador ver o que ficou de fora e porque. Rejeitar o ficheiro inteiro
 * por causa de uma linha seria a pior forma de tratar um ficheiro de 80
 * insumos.
 */
export function parseIngredientCsv(text: string): IngredientCsvResult {
  const linhas = text.split(/\r?\n/);
  const primeira = linhas.findIndex((l) => l.trim().length > 0);
  if (primeira < 0) return { rows: [], errors: [] };

  const cabecalho = linhas[primeira];
  const delimiter = countOf(cabecalho, ';') >= countOf(cabecalho, ',') ? ';' : ',';
  const cols = splitRow(cabecalho, delimiter).map((h) => normalizeText(h));

  const idx = {
    name: findCol(cols, ['nome', 'insumo', 'produto', 'name']),
    price: findCol(cols, ['preco', 'price', 'valor', 'custo']),
    qty: findCol(cols, ['quantidade', 'qtd', 'qty', 'tamanho']),
    unit: findCol(cols, ['unidade', 'unit', 'un']),
    supplier: findCol(cols, ['fornecedor', 'supplier', 'loja', 'fonte']),
    category: findCol(cols, ['categoria', 'category', 'tipo']),
    waste: findCol(cols, ['perda', 'desperdicio', 'waste']),
    fc: findCol(cols, ['fc', 'fator', 'fator de correcao']),
    stock: findCol(cols, ['estoque', 'stock', 'saldo']),
  };

  if (idx.name < 0 || idx.price < 0 || idx.qty < 0) {
    throw new Error(
      'CSV invalido: sao obrigatorias as colunas "nome", "preco" e "quantidade".',
    );
  }

  const rows: IngredientCsvRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  for (let i = primeira + 1; i < linhas.length; i++) {
    const bruta = linhas[i];
    if (!bruta.trim()) continue;

    const numeroLinha = i + 1;
    const cells = splitRow(bruta, delimiter);
    const name = (cells[idx.name] ?? '').trim();

    if (!name) {
      errors.push({ line: numeroLinha, reason: 'sem nome' });
      continue;
    }

    const preco = csvNumber(cells[idx.price]);
    const qty = csvQty(cells[idx.qty]);

    if (!Number.isFinite(preco) || preco <= 0) {
      errors.push({ line: numeroLinha, reason: `"${name}": preco invalido` });
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ line: numeroLinha, reason: `"${name}": quantidade invalida` });
      continue;
    }

    // A perda pode vir como percentagem ou como fator; o fator manda.
    let fc = 1;
    if (idx.fc >= 0 && (cells[idx.fc] ?? '').trim()) {
      const v = csvNumber(cells[idx.fc]);
      if (Number.isFinite(v) && v >= 1) fc = v;
    } else if (idx.waste >= 0 && (cells[idx.waste] ?? '').trim()) {
      const perda = csvNumber(cells[idx.waste]);
      if (Number.isFinite(perda) && perda > 0 && perda < 100) {
        fc = 1 / (1 - perda / 100);
      }
    }

    const categoriaTexto = normalizeText(
      idx.category >= 0 ? (cells[idx.category] ?? '') : '',
    );
    const category = /embal|descart|pack/.test(categoriaTexto) ? 'PACKAGING' : 'FOOD';

    const fornecedor =
      idx.supplier >= 0 ? (cells[idx.supplier] ?? '').trim() || null : null;

    const estoque = idx.stock >= 0 ? csvQty(cells[idx.stock]) : 0;

    rows.push({
      name,
      purchasePrice: preco,
      purchaseQty: qty,
      unit: normalizeUnit(idx.unit >= 0 ? cells[idx.unit] : 'UN'),
      category,
      supplierName: fornecedor,
      correctionFactor: fc,
      stockBase: Number.isFinite(estoque) && estoque > 0 ? estoque : 0,
      line: numeroLinha,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Adapters de supermercado (por ligar)
// ---------------------------------------------------------------------------

/**
 * Esqueleto de adapter para uma cadeia de supermercados.
 *
 * Para ativar: implemente `fetchQuotes` com a fonte que tiver direito de usar
 * (API do distribuidor, feed licenciado, o seu proprio recolhedor) e registe
 * o provider em `getProviders()`. Enquanto `fetchQuotes` for nulo, o provider
 * declara-se nao configurado e a UI mostra-o como indisponivel em vez de
 * falhar silenciosamente.
 */
export function supermarketAdapter(
  source: Extract<QuoteSource, 'CONTINENTE' | 'PINGO_DOCE' | 'AUCHAN'>,
  name: string,
  fetchQuotes?: (term: string) => Promise<PriceQuoteResult[]>,
): PriceProvider {
  return {
    source,
    name,
    isConfigured: () => typeof fetchQuotes === 'function',
    async search(term: string) {
      if (!fetchQuotes) return [];
      try {
        return await fetchQuotes(term);
      } catch {
        // Uma fonte externa em baixo nao pode derrubar a pagina de insumos.
        return [];
      }
    },
  };
}

export function getProviders(): PriceProvider[] {
  return [
    supermarketAdapter('CONTINENTE', 'Continente'),
    supermarketAdapter('PINGO_DOCE', 'Pingo Doce'),
    supermarketAdapter('AUCHAN', 'Auchan'),
  ];
}

// ---------------------------------------------------------------------------
// Comparacao
// ---------------------------------------------------------------------------

/** Custo por unidade base de uma cotacao. */
export function quoteUnitCost(quote: PriceQuoteResult): number {
  const qtyBase = toBase(quote.qty, quote.unit);
  return qtyBase > 0 ? quote.price / qtyBase : 0;
}

export function compareQuote(
  quote: PriceQuoteResult,
  currentUnitCost: number,
): QuoteComparison {
  const unitCost = quoteUnitCost(quote);
  const delta = currentUnitCost > 0 ? unitCost / currentUnitCost - 1 : 0;
  return {
    quote,
    quoteUnitCost: unitCost,
    currentUnitCost,
    delta,
    cheaper: unitCost < currentUnitCost,
  };
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function countOf(line: string, ch: string): number {
  return line.split(ch).length - 1;
}

/** Split de CSV que respeita aspas duplas. */
function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function findCol(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h));
}

/**
 * Numero de uma celula de CSV, ou `NaN` se a celula nao tem numero nenhum.
 *
 * O `NaN` e de proposito: distingue "a coluna vinha vazia" de "a coluna dizia
 * zero", e ha sitios que tratam os dois de maneira diferente.
 *
 * A leitura dos separadores e a mesma dos formularios, incluindo a regra de
 * que um grupo de milhar nunca comeca por zero — um CSV com `0.200` na coluna
 * da quantidade sofria exatamente o mesmo engano.
 */
function csvNumber(cell: string | undefined): number {
  return csvLido(cell, parseDecimal);
}

/** Como `csvNumber`, mas para quantidades: o ponto e sempre decimal. */
function csvQty(cell: string | undefined): number {
  return csvLido(cell, parseQty);
}

function csvLido(
  cell: string | undefined,
  ler: (v: string) => number,
): number {
  if (!cell) return NaN;
  const limpo = cell.replace(/[^\d,.\-]/g, '');
  if (!limpo || !/\d/.test(limpo)) return NaN;
  return ler(cell);
}

function normalizeUnit(cell: string | undefined): PurchaseUnit {
  const v = (cell ?? '').trim().toUpperCase();
  if (v === 'KG' || v === 'G' || v === 'L' || v === 'ML' || v === 'UN') return v;
  if (v === 'LT' || v === 'LITRO' || v === 'LITROS') return 'L';
  if (v === 'GR' || v === 'GRAMA' || v === 'GRAMAS') return 'G';
  if (v === 'UNID' || v === 'UNIDADE' || v === 'PCT') return 'UN';
  return 'UN';
}

function normalizeSource(cell: string | undefined): QuoteSource {
  const v = normalizeText(cell ?? '');
  if (v.includes('continente')) return 'CONTINENTE';
  if (v.includes('pingo')) return 'PINGO_DOCE';
  if (v.includes('auchan') || v.includes('jumbo')) return 'AUCHAN';
  if (v.includes('csv')) return 'CSV';
  if (!v) return 'CSV';
  return 'OTHER';
}

/** Minusculas e sem acentos, para comparar "Açúcar" com "acucar". */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
