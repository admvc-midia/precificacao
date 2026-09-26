/**
 * Registo de providers de preco e utilitarios de comparacao.
 * Ver `types.ts` para a explicacao do desenho.
 */

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
    const qty = idx.qty >= 0 ? csvNumber(cells[idx.qty]) || 1 : 1;
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

function csvNumber(cell: string | undefined): number {
  if (!cell) return NaN;
  return Number(
    cell
      .replace(/[^\d,.\-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.'),
  );
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
