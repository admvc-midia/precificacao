/**
 * DRE do produto: para onde vai cada centimo do preco de venda (Modulo 3).
 *
 * Forma escolhida: uma unica barra empilhada 100%, porque a pergunta e
 * parte-de-todo sobre UM total (o preco), nao comparacao entre categorias.
 * Ao lado vai sempre a tabela com os valores em moeda — e a leitura precisa,
 * e garante que nenhuma informacao depende so da cor.
 *
 * Paleta: slots categoricos 1-7 na ordem fixa, separados por um intervalo de
 * 2px na cor da superficie. A ordem dos segmentos segue o caminho do dinheiro
 * (insumo -> embalagem -> entrega -> imposto -> taxas -> custo fixo -> lucro),
 * nao o tamanho: assim a barra de um produto e comparavel com a de outro.
 *
 * Prejuizo nao e "mais um segmento": e um estado. Por isso usa a cor de
 * status critical acompanhada de icone e texto, nunca cor sozinha.
 */

import { AlertTriangle } from 'lucide-react';

import { formatMoney, formatPercent, type CurrencyConfig } from '@/lib/money';
import type { PriceBreakdown } from '@/lib/pricing/types';

interface Slice {
  key: string;
  label: string;
  value: number;
  /** Indice do slot categorico (1-7). */
  slot: number;
}

export function DreBreakdown({
  result,
  currency,
  title = 'Para onde vai cada centimo',
}: {
  result: PriceBreakdown;
  currency: CurrencyConfig;
  title?: string;
}) {
  const loss = result.profit < 0;

  const slices: Slice[] = [
    { key: 'food', label: 'Insumos', value: result.foodCost, slot: 1 },
    { key: 'packaging', label: 'Embalagem', value: result.packagingCost, slot: 2 },
    { key: 'delivery', label: 'Entrega', value: result.deliveryCost, slot: 3 },
    { key: 'vat', label: 'IVA / impostos', value: result.vatAmount, slot: 4 },
    {
      key: 'fees',
      label: 'Cartao + plataforma',
      value: result.cardFee + result.platformFee,
      slot: 5,
    },
    { key: 'fixed', label: 'Custos fixos', value: result.fixedCost, slot: 6 },
    {
      key: 'profit',
      label: loss ? 'Prejuizo' : 'Lucro liquido',
      value: result.profit,
      slot: 7,
    },
  ];

  // Num prejuizo os custos somam mais que o preco. Normalizar pela soma dos
  // segmentos positivos mantem a barra honesta: ela mostra a reparticao real
  // do que foi gasto, e o prejuizo aparece destacado fora dela.
  const positive = slices.filter((s) => s.value > 0.0000001);
  const total = positive.reduce((acc, s) => acc + s.value, 0) || 1;

  return (
    <figure className="viz-root m-0 space-y-4">
      <style
        // Tokens locais: os valores de dark mode sao escolhidos para a
        // superficie escura, nao gerados por inversao.
        dangerouslySetInnerHTML={{
          __html: `
.viz-root{
  --viz-surface:#fcfcfb;
  --viz-s1:#2a78d6; --viz-s2:#eb6834; --viz-s3:#1baf7a; --viz-s4:#eda100;
  --viz-s5:#e87ba4; --viz-s6:#008300; --viz-s7:#4a3aa7;
  --viz-critical:#d03b3b;
}
@media (prefers-color-scheme: dark){
.viz-root{
  --viz-surface:#1a1a19;
  --viz-s1:#3987e5; --viz-s2:#d95926; --viz-s3:#199e70; --viz-s4:#c98500;
  --viz-s5:#d55181; --viz-s6:#008300; --viz-s7:#9085e9;
  --viz-critical:#d03b3b;
}
}
.viz-track{ display:flex; gap:2px; height:24px; }
.viz-seg{ position:relative; min-width:3px; }
.viz-seg:first-child{ border-top-left-radius:4px; border-bottom-left-radius:4px; }
.viz-seg:last-child{ border-top-right-radius:4px; border-bottom-right-radius:4px; }
.viz-seg > .viz-tip{
  position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
  white-space:nowrap; opacity:0; pointer-events:none; transition:opacity .12s ease;
  z-index:20;
}
.viz-seg:hover > .viz-tip, .viz-seg:focus-visible > .viz-tip{ opacity:1; }
`,
        }}
      />

      <figcaption className="text-sm font-medium">{title}</figcaption>

      {/* A barra. Cada segmento e focavel para que a dica tambem apareca
          por teclado, e nao apenas com o rato. */}
      <div className="viz-track" role="img" aria-label={ariaSummary(slices, total, currency)}>
        {positive.map((slice) => (
          <div
            key={slice.key}
            tabIndex={0}
            className="viz-seg outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              flexGrow: slice.value,
              flexBasis: 0,
              backgroundColor: `var(--viz-s${slice.slot})`,
            }}
          >
            <span className="viz-tip rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
              {slice.label} · {formatMoney(slice.value, currency)} ·{' '}
              {formatPercent(slice.value / total, currency.locale)}
            </span>
          </div>
        ))}
      </div>

      {/* Legenda: identidade nunca depende so da cor. */}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{
                backgroundColor:
                  slice.key === 'profit' && loss
                    ? 'var(--viz-critical)'
                    : `var(--viz-s${slice.slot})`,
              }}
            />
            <span className="flex-1 truncate text-muted-foreground">{slice.label}</span>
            <span className="tabular-nums font-medium">
              {formatMoney(slice.value, currency)}
            </span>
            <span className="w-12 text-right tabular-nums text-xs text-muted-foreground">
              {formatPercent(slice.value / total, currency.locale)}
            </span>
          </li>
        ))}
      </ul>

      {loss ? (
        <p className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Este preco nao cobre os custos: faltam{' '}
            <strong className="tabular-nums">
              {formatMoney(Math.abs(result.profit), currency)}
            </strong>{' '}
            por unidade vendida.
          </span>
        </p>
      ) : null}
    </figure>
  );
}

function ariaSummary(
  slices: Slice[],
  total: number,
  currency: CurrencyConfig,
): string {
  const parts = slices
    .filter((s) => Math.abs(s.value) > 0.0000001)
    .map(
      (s) =>
        `${s.label}: ${formatMoney(s.value, currency)}, ${formatPercent(
          s.value / total,
          currency.locale,
        )}`,
    );
  return `Reparticao do preco de venda. ${parts.join('. ')}.`;
}

/** Cartao compacto de indicador. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warning' | 'critical';
}) {
  const tones = {
    default: 'text-foreground',
    good: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    critical: 'text-red-700 dark:text-red-400',
  };
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
