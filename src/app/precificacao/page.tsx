import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { CmvBadge } from '@/components/cmv-badge';
import { Alert } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import { formatMoney, formatPercent } from '@/lib/money';
import { channelContext } from '@/lib/pricing/channels';
import {
  analyzeManualPrice,
  priceFromTargetCmv,
  priceFromTargetMargin,
} from '@/lib/pricing/price';
import type { PriceResult } from '@/lib/pricing/types';
import { getCostedRecipes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MODE_LABEL: Record<string, string> = {
  TARGET_CMV: 'CMV alvo',
  TARGET_MARGIN: 'Margem alvo',
  MANUAL: 'Preco manual',
};

export default async function PrecificacaoPage() {
  const { recipes, settings, currency, channels } = await getCostedRecipes();
  const products = recipes.filter((r) => r.kind === 'PRODUCT');
  const reference = channels.find((c) => c.kind === 'COUNTER') ?? channels[0];

  const rows = products.map((r) => {
    if (!r.cost || !reference) return { recipe: r, result: null as PriceResult | null };

    const { params, costs } = channelContext(r.cost, reference, settings);
    const opts = { rounding: settings.rounding };

    let result: PriceResult;
    if (r.pricingMode === 'MANUAL') {
      result = analyzeManualPrice(r.manualPrice ?? 0, costs, params);
    } else if (r.pricingMode === 'TARGET_MARGIN') {
      result = priceFromTargetMargin(
        costs,
        params,
        r.targetMargin ?? settings.targetMargin,
        opts,
      );
    } else {
      result = priceFromTargetCmv(costs, params, r.targetCmv ?? settings.targetCmv, opts);
    }
    return { recipe: r, result };
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Precificacao</h1>
        <p className="text-sm text-muted-foreground">
          Preco e margem de cada produto no canal de referencia
          {reference ? ` (${reference.name})` : ''}.
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

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>
            O CMV mede a eficiencia: quanto menor, mais sobra para pagar a casa.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum produto final cadastrado.{' '}
              <Link href="/fichas" className="text-primary hover:underline">
                Crie uma ficha tecnica
              </Link>
              .
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Custo primo</TableHead>
                  <TableHead className="text-right">Preco</TableHead>
                  <TableHead className="text-right">CMV</TableHead>
                  <TableHead className="text-right">Margem liquida</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ recipe, result }) => (
                  <TableRow key={recipe.id}>
                    <TableCell>
                      <Link
                        href={`/precificacao/${recipe.id}`}
                        className="font-medium hover:underline"
                      >
                        {recipe.name}
                      </Link>
                      {recipe.error ? (
                        <div className="mt-0.5 text-xs text-destructive">
                          {recipe.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MODE_LABEL[recipe.pricingMode]}
                    </TableCell>
                    <TableNum className="text-muted-foreground">
                      {recipe.cost ? formatMoney(recipe.cost.primeCost, currency) : '—'}
                    </TableNum>
                    <TableNum className="font-medium">
                      {result?.feasible ? formatMoney(result.price, currency) : '—'}
                    </TableNum>
                    <TableNum>
                      {result?.feasible ? (
                        <CmvBadge cmv={result.cmv} locale={currency.locale} />
                      ) : (
                        '—'
                      )}
                    </TableNum>
                    <TableNum>
                      {result?.feasible
                        ? formatPercent(result.netMargin, currency.locale)
                        : '—'}
                    </TableNum>
                    <TableNum
                      className={
                        result && result.profit < 0
                          ? 'font-medium text-destructive'
                          : 'font-medium'
                      }
                    >
                      {result?.feasible ? formatMoney(result.profit, currency) : '—'}
                    </TableNum>
                    <TableCell className="text-right">
                      <Link
                        href={`/precificacao/${recipe.id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
