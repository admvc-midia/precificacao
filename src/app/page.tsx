import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  PackageOpen,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { CmvBadge } from '@/components/cmv-badge';
import { StatTile } from '@/components/dre-breakdown';
import { Alert, Badge } from '@/components/ui/badge';
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
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import { channelContext } from '@/lib/pricing/channels';
import {
  analyzeManualPrice,
  priceFromTargetCmv,
  priceFromTargetMargin,
} from '@/lib/pricing/price';
import type { PriceResult } from '@/lib/pricing/types';
import { getCostedRecipes } from '@/lib/queries';
import { lowStock } from '@/lib/pricing/stock';
import { formatBaseQty, toBase } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { recipes, settings, currency, channels } = await getCostedRecipes();

  // O que esta a acabar. Uma consulta so, e so o que precisa de ser lido.
  const aAcabar = lowStock(
    (
      await prisma.ingredient.findMany({
        where: { minStockBase: { not: null } },
        select: {
          id: true,
          name: true,
          baseUnit: true,
          stockBase: true,
          minStockBase: true,
        },
      })
    ).map((i) => ({
      ingredientId: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      qtyBase: num(i.stockBase),
      minBase: i.minStockBase === null ? null : num(i.minStockBase),
    })),
  );
  const reference = channels.find((c) => c.kind === 'COUNTER') ?? channels[0];
  const products = recipes.filter((r) => r.kind === 'PRODUCT');

  const priced = products
    .map((r) => {
      if (!r.cost || !reference) return null;
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
        result = priceFromTargetCmv(
          costs,
          params,
          r.targetCmv ?? settings.targetCmv,
          opts,
        );
      }
      return { recipe: r, result };
    })
    .filter((x): x is { recipe: (typeof products)[number]; result: PriceResult } =>
      Boolean(x?.result.feasible),
    );

  const avgContribution =
    priced.length > 0
      ? priced.reduce((a, p) => a + p.result.contributionMargin, 0) / priced.length
      : 0;

  const best = [...priced].sort(
    (a, b) => b.result.contributionMargin - a.result.contributionMargin,
  );
  const worst = [...priced].sort((a, b) => a.result.profit - b.result.profit);
  const atRisk = worst.filter((p) => p.result.profit <= 0 || p.result.cmv > 0.4);

  const avgCmv =
    priced.length > 0 ? priced.reduce((a, p) => a + p.result.cmv, 0) / priced.length : 0;

  const alerts = await priceAlerts();

  const setupDone =
    channels.length > 0 && recipes.length > 0 && priced.length > 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <p className="text-sm text-muted-foreground">
          Onde esta o lucro e onde esta o risco.
        </p>
      </header>

      {!setupDone ? <SetupGuide hasChannels={channels.length > 0} recipeCount={recipes.length} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Produtos precificados" value={String(priced.length)} />
        <StatTile
          label="CMV medio"
          value={priced.length ? formatPercent(avgCmv, currency.locale) : '—'}
          tone={avgCmv <= 0.3 ? 'good' : avgCmv <= 0.4 ? 'warning' : 'critical'}
          hint={`Alvo ${formatPercent(settings.targetCmv, currency.locale, 0)}`}
        />
        <StatTile
          label="Margem de contribuicao media"
          value={priced.length ? formatMoney(avgContribution, currency) : '—'}
          hint="Por unidade vendida"
        />
        <StatTile
          label="Produtos em risco"
          value={String(atRisk.length)}
          tone={atRisk.length > 0 ? 'critical' : 'good'}
          hint="Prejuizo ou CMV acima de 40%"
        />
      </div>

      {aAcabar.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              A acabar no armazem
            </CardTitle>
            <CardDescription>
              No minimo que voce definiu, ou abaixo. Quem nao tem minimo definido
              nao aparece aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {aAcabar.slice(0, 8).map((l) => (
              <div
                key={l.ingredientId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{l.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {formatBaseQty(l.qtyBase, l.baseUnit, currency.locale)}
                    {l.minBase !== null ? (
                      <> de {formatBaseQty(l.minBase, l.baseUnit, currency.locale)}</>
                    ) : null}
                  </span>
                  <Badge
                    variant={l.level === 'BAIXO' ? 'warning' : 'destructive'}
                  >
                    {l.level === 'BAIXO'
                      ? 'a acabar'
                      : l.level === 'ACABOU'
                        ? 'acabou'
                        : 'negativo'}
                  </Badge>
                </span>
              </div>
            ))}
            {aAcabar.length > 8 ? (
              <p className="text-xs text-muted-foreground">
                e mais {aAcabar.length - 8}.
              </p>
            ) : null}
            <Link
              href="/estoque"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ver o estoque
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {alerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Flutuacao de preco de insumos
            </CardTitle>
            <CardDescription>
              Comparado com a cotacao anterior registada para o mesmo insumo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    {formatPercent(Math.abs(a.delta), currency.locale)}
                  </span>
                  <Badge variant={a.delta > 0 ? 'destructive' : 'success'}>
                    {a.delta > 0 ? (
                      <>
                        <TrendingUp className="mr-1 h-3 w-3" aria-hidden />
                        subiu
                      </>
                    ) : (
                      <>
                        <TrendingDown className="mr-1 h-3 w-3" aria-hidden />
                        desceu
                      </>
                    )}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Maior margem de contribuicao</CardTitle>
            <CardDescription>
              O que cada venda deixa para pagar a casa, em {currency.currency}. A
              matriz Estrela/Abacaxi vive em{' '}
              <Link href="/vendas" className="text-primary hover:underline">
                Vendas
              </Link>
              , onde ha dados de popularidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ProductTable
              rows={best.slice(0, 6)}
              currency={currency}
              avgContribution={avgContribution}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maior risco</CardTitle>
            <CardDescription>
              Produtos com o menor lucro por unidade — os primeiros a rever.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ProductTable
              rows={worst.slice(0, 6)}
              currency={currency}
              avgContribution={avgContribution}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProductTable({
  rows,
  currency,
  avgContribution,
}: {
  rows: Array<{ recipe: { id: string; name: string }; result: PriceResult }>;
  currency: { currency: string; locale: string };
  avgContribution: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        Sem produtos precificados ainda.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Preco</TableHead>
          <TableHead className="text-right">CMV</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ recipe, result }) => {
          // A classificacao de engenharia de cardapio precisa do eixo da
          // popularidade, que vive nas vendas lancadas. Aqui so se diz se a
          // margem esta acima ou abaixo da media — inventar a popularidade
          // dava uma etiqueta bonita e errada.
          const acimaDaMedia = result.contributionMargin >= avgContribution;
          return (
            <TableRow key={recipe.id}>
              <TableCell>
                <Link
                  href={`/precificacao/${recipe.id}`}
                  className="font-medium hover:underline"
                >
                  {recipe.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  margem {acimaDaMedia ? 'acima' : 'abaixo'} da media
                </div>
              </TableCell>
              <TableNum>{formatMoney(result.price, currency)}</TableNum>
              <TableNum>
                <CmvBadge cmv={result.cmv} locale={currency.locale} />
              </TableNum>
              <TableNum
                className={result.profit < 0 ? 'font-medium text-destructive' : 'font-medium'}
              >
                {formatMoney(result.profit, currency)}
              </TableNum>
              <TableCell>
                <Link href={`/precificacao/${recipe.id}`} aria-label={`Abrir ${recipe.name}`}>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SetupGuide({
  hasChannels,
  recipeCount,
}: {
  hasChannels: boolean;
  recipeCount: number;
}) {
  const steps = [
    { done: hasChannels, label: 'Configurar canais de venda', href: '/configuracoes' },
    { done: recipeCount > 0, label: 'Criar fichas tecnicas', href: '/fichas' },
  ];

  return (
    <Alert tone="info">
      <p className="mb-2 font-medium">Comece por aqui</p>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.href} className="flex items-center gap-2 text-sm">
            <span className="tabular-nums">{i + 1}.</span>
            <Link href={s.href} className="underline underline-offset-2">
              {s.label}
            </Link>
            {s.done ? <Badge variant="success">feito</Badge> : null}
          </li>
        ))}
      </ol>
    </Alert>
  );
}

/**
 * Compara as duas cotacoes mais recentes de cada insumo, normalizadas pela
 * unidade base, e devolve as que se moveram mais de 5%.
 */
async function priceAlerts() {
  const quotes = await prisma.priceQuote.findMany({
    orderBy: { capturedAt: 'desc' },
    take: 200,
    include: { ingredient: { select: { name: true } } },
  });

  const byIngredient = new Map<string, typeof quotes>();
  for (const q of quotes) {
    const list = byIngredient.get(q.ingredientId) ?? [];
    if (list.length < 2) list.push(q);
    byIngredient.set(q.ingredientId, list);
  }

  const out: Array<{ id: string; name: string; delta: number }> = [];
  for (const [id, list] of byIngredient) {
    if (list.length < 2) continue;
    const [latest, previous] = list;

    const unitCost = (q: (typeof quotes)[number]) => {
      const base = toBase(num(q.qty), q.unit);
      return base > 0 ? num(q.price) / base : 0;
    };

    const now = unitCost(latest);
    const before = unitCost(previous);
    if (before <= 0) continue;

    const delta = now / before - 1;
    if (Math.abs(delta) >= 0.05) {
      out.push({ id, name: latest.ingredient.name, delta });
    }
  }

  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
}
