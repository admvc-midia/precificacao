import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { CmvBadge } from '@/components/cmv-badge';
import { DataList, type ListColumn, type ListRow } from '@/components/data-list';
import { Miniatura } from '@/components/miniatura';
import { Alert } from '@/components/ui/badge';
import { formatMoney, formatPercent } from '@/lib/money';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MODE_LABEL: Record<string, string> = {
  TARGET_CMV: 'CMV alvo',
  TARGET_MARGIN: 'Margem alvo',
  MANUAL: 'Preco manual',
};

const COLUMNS: ListColumn[] = [
  { header: 'Produto' },
  { header: 'Modo', hideBelow: 'xl' },
  { header: 'Custo do produto', align: 'right', hideBelow: 'lg' },
  { header: 'Preco', align: 'right' },
  { header: 'CMV', align: 'right' },
  { header: 'Margem', align: 'right', hideBelow: 'lg' },
  { header: 'Lucro', align: 'right' },
];

export default async function PrecificacaoPage() {
  const { recipes, settings, currency, channels } = await getCostedRecipes();
  const products = recipes.filter((r) => r.kind === 'PRODUCT');
  const reference = referenceChannel(channels);

  const rows: ListRow[] = products.map((r) => {
    const result = priceForRecipe(r, reference, settings);

    const viavel = result?.feasible ?? false;
    const preco = viavel ? formatMoney(result!.price, currency) : '—';
    const lucro = viavel ? formatMoney(result!.profit, currency) : '—';
    const prejuizo = Boolean(result && result.profit < 0);
    const cmv = viavel ? (
      <CmvBadge key="c" cmv={result!.cmv} locale={currency.locale} />
    ) : (
      <span key="c" className="text-muted-foreground">
        —
      </span>
    );

    const nome = (
      <Link
        key="n"
        href={`/precificacao/${r.id}`}
        className="flex items-center gap-3 font-medium hover:underline"
      >
        <Miniatura recipeId={r.id} nome={r.name} caminho={r.photoThumbPath} />
        {r.name}
      </Link>
    );

    return {
      id: r.id,
      search: `${r.name} ${MODE_LABEL[r.pricingMode] ?? ''}`,
      cells: [
        nome,
        <span key="m" className="text-muted-foreground">
          {MODE_LABEL[r.pricingMode]}
        </span>,
        <span key="p" className="text-muted-foreground">
          {r.cost ? formatMoney(r.cost.productCost, currency) : '—'}
        </span>,
        <span key="v" className="font-medium">
          {preco}
        </span>,
        cmv,
        <span key="g">
          {viavel ? formatPercent(result!.netMargin, currency.locale) : '—'}
        </span>,
        <span key="l" className={prejuizo ? 'font-medium text-destructive' : 'font-medium'}>
          {lucro}
        </span>,
      ],
      title: nome,
      lead: <span className="font-medium">{preco}</span>,
      meta: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          CMV {cmv}
          <span>
            · lucro{' '}
            <span className={prejuizo ? 'font-medium text-destructive' : 'font-medium'}>
              {lucro}
            </span>
          </span>
          <span className="hidden sm:inline">· {MODE_LABEL[r.pricingMode]}</span>
        </span>
      ),
      note: r.error,
      actions: (
        <Link
          href={`/precificacao/${r.id}`}
          className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-1.5 text-sm text-primary hover:underline"
        >
          Abrir
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Precificacao
            <AjudaLink secao="precificacao" />
          </h1>
        <p className="text-sm text-muted-foreground">
          Preco e margem de cada produto no canal de referencia
          {reference ? ` (${reference.name})` : ''}. O CMV mede a eficiencia:
          quanto menor, mais sobra para pagar a casa.
        </p>
      </header>

      {!reference ? (
        <Alert tone="destructive">
          Nenhum canal de venda configurado. Crie pelo menos o balcao em{' '}
          <Link href="/configuracoes" className="underline">
            Configuracoes
          </Link>
          .
        </Alert>
      ) : null}

      <DataList
        columns={COLUMNS}
        rows={rows}
        searchPlaceholder="Procurar produto…"
        empty="Nenhum produto final cadastrado. Crie uma ficha tecnica primeiro."
      />
    </div>
  );
}
