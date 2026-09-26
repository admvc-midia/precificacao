import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Info } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { CmvBadge } from '@/components/cmv-badge';
import { DreBreakdown, StatTile } from '@/components/dre-breakdown';
import { Alert, Badge, Separator } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import { saveRecipePricing } from '@/lib/actions/recipes';
import { buildCostContext, num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import { breakEvenPrice, simulateChannels } from '@/lib/pricing/channels';
import { computeRecipeCost } from '@/lib/pricing/cost';
import { getPricingData, getRecipeDetail } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PrecificarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, data] = await Promise.all([getRecipeDetail(id), getPricingData()]);
  if (!recipe) notFound();

  const { settings, currency, channels } = data;
  const ctx = buildCostContext(data.ingredientRows, data.recipeRows);

  let cost;
  try {
    cost = computeRecipeCost(id, ctx);
  } catch (err) {
    return (
      <Alert tone="destructive">
        Nao foi possivel calcular o custo desta ficha:{' '}
        {err instanceof Error ? err.message : String(err)}
      </Alert>
    );
  }

  if (channels.length === 0) {
    return (
      <Alert tone="destructive">
        Nenhum canal de venda configurado. Crie pelo menos o balcao em{' '}
        <Link href="/configuracoes" className="underline">
          Configuracoes
        </Link>
        .
      </Alert>
    );
  }

  const sim = simulateChannels({
    cost,
    settings,
    channels,
    mode: recipe.pricingMode,
    manualPrice: recipe.manualPrice === null ? null : num(recipe.manualPrice),
    targetCmv: recipe.targetCmv === null ? null : num(recipe.targetCmv),
    targetMargin: recipe.targetMargin === null ? null : num(recipe.targetMargin),
  });

  const ref = sim.reference;
  const refPrice = ref.suggested;
  const be = breakEvenPrice(ref.costs, ref.params);

  const pctValue = (v: number | null) =>
    v === null ? '' : (v * 100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/precificacao"
            className="text-sm text-muted-foreground hover:underline"
          >
            Precificacao
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Canal de referencia: <strong>{ref.channel.name}</strong>. Os outros canais
          replicam o mesmo lucro em {currency.currency}, nao a mesma percentagem.
        </p>
      </header>

      {refPrice.warnings.map((w) => (
        <Alert key={w} tone={refPrice.feasible ? 'warning' : 'destructive'}>
          {w}
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Custo primo"
          value={formatMoney(cost.primeCost, currency)}
          hint={`Alimento ${formatMoney(cost.foodCostPerUnit, currency)} + embalagem ${formatMoney(cost.packagingCost, currency)}`}
        />
        <StatTile
          label={`Preco em ${ref.channel.name}`}
          value={refPrice.feasible ? formatMoney(refPrice.price, currency) : '—'}
          hint={
            refPrice.rawPrice !== refPrice.price
              ? `Sem arredondamento: ${formatMoney(refPrice.rawPrice, currency)}`
              : undefined
          }
        />
        <StatTile
          label="CMV"
          value={refPrice.feasible ? formatPercent(refPrice.cmv, currency.locale) : '—'}
          tone={refPrice.cmv <= 0.3 ? 'good' : refPrice.cmv <= 0.4 ? 'warning' : 'critical'}
          hint={`Alvo ${formatPercent(recipe.targetCmv === null ? settings.targetCmv : num(recipe.targetCmv), currency.locale, 0)}`}
        />
        <StatTile
          label="Lucro por unidade"
          value={refPrice.feasible ? formatMoney(refPrice.profit, currency) : '—'}
          tone={refPrice.profit < 0 ? 'critical' : 'good'}
          hint={be !== null ? `Break-even: ${formatMoney(be, currency)}` : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Simulador multi-canal</CardTitle>
              <CardDescription>
                &quot;Preco para o mesmo lucro&quot; e quanto cobrar em cada canal
                para levar para casa o mesmo dinheiro do balcao.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Comissao</TableHead>
                    <TableHead className="text-right">Preco sugerido</TableHead>
                    <TableHead className="text-right">Mesmo lucro</TableHead>
                    <TableHead className="text-right">CMV</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sim.results.map((r) => {
                    const isRef = r.channel.id === ref.channel.id;
                    const shown = r.profitMatched ?? r.suggested;
                    return (
                      <TableRow key={r.channel.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{r.channel.name}</span>
                            {isRef ? (
                              <Badge variant="secondary">referencia</Badge>
                            ) : null}
                          </div>
                          {r.channel.deliveryCost > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              frete {formatMoney(r.channel.deliveryCost, currency)}
                              {r.channel.usesDeliveryPackaging
                                ? ' · embalagem de transporte'
                                : ''}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableNum className="text-muted-foreground">
                          {r.channel.commissionRate > 0
                            ? formatPercent(r.channel.commissionRate, currency.locale, 0)
                            : '—'}
                        </TableNum>
                        <TableNum className="text-muted-foreground">
                          {r.suggested.feasible
                            ? formatMoney(r.suggested.price, currency)
                            : 'inviavel'}
                        </TableNum>
                        <TableNum className="font-medium">
                          {r.profitMatchedPrice !== null
                            ? formatMoney(r.profitMatchedPrice, currency)
                            : 'inviavel'}
                        </TableNum>
                        <TableNum>
                          <CmvBadge cmv={shown.cmv} locale={currency.locale} />
                        </TableNum>
                        <TableNum
                          className={shown.profit < 0 ? 'text-destructive' : undefined}
                        >
                          {formatMoney(shown.profit, currency)}
                        </TableNum>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-start gap-2 border-t px-6 py-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <p>
                  Repare que o CMV cai nos canais de comissao: o custo do produto nao
                  mudou, o preco e que subiu para absorver a taxa. E por isso que
                  comparar CMV entre canais engana — compare o lucro em{' '}
                  {currency.currency}.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DRE do produto — {ref.channel.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <DreBreakdown result={refPrice} currency={currency} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Como calcular o preco</CardTitle>
              <CardDescription>
                Campos de alvo vazios usam o valor global das configuracoes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveRecipePricing}>
                <input type="hidden" name="id" value={id} />

                <Field label="Modo" htmlFor="mode">
                  <Select id="mode" name="pricingMode" defaultValue={recipe.pricingMode}>
                    <option value="TARGET_CMV">
                      CMV alvo — parto do custo do produto
                    </option>
                    <option value="TARGET_MARGIN">
                      Margem alvo — parto do lucro que quero
                    </option>
                    <option value="MANUAL">
                      Preco manual — ja sei quanto cobro
                    </option>
                  </Select>
                </Field>

                <Field
                  label="CMV alvo (%)"
                  htmlFor="targetCmv"
                  hint={`Global: ${formatPercent(settings.targetCmv, currency.locale, 0)}`}
                >
                  <Input
                    id="targetCmv"
                    name="targetCmv"
                    inputMode="decimal"
                    defaultValue={pctValue(
                      recipe.targetCmv === null ? null : num(recipe.targetCmv),
                    )}
                    placeholder={(settings.targetCmv * 100).toFixed(0)}
                  />
                </Field>

                <Field
                  label="Lucro liquido alvo (%)"
                  htmlFor="targetMargin"
                  hint={`Global: ${formatPercent(settings.targetMargin, currency.locale, 0)}`}
                >
                  <Input
                    id="targetMargin"
                    name="targetMargin"
                    inputMode="decimal"
                    defaultValue={pctValue(
                      recipe.targetMargin === null ? null : num(recipe.targetMargin),
                    )}
                    placeholder={(settings.targetMargin * 100).toFixed(0)}
                  />
                </Field>

                <Field
                  label="Preco manual"
                  htmlFor="manualPrice"
                  hint="Usado apenas no modo manual."
                >
                  <Input
                    id="manualPrice"
                    name="manualPrice"
                    inputMode="decimal"
                    defaultValue={
                      recipe.manualPrice === null ? '' : String(num(recipe.manualPrice))
                    }
                  />
                </Field>

                <SubmitButton>Guardar</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Premissas em uso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Line
                label="IVA"
                value={`${formatPercent(settings.vatRate, currency.locale, 0)} ${
                  settings.vatMode === 'INCLUDED' ? '(incluido no preco)' : '(acrescido)'
                }`}
              />
              <Line
                label="Custos fixos"
                value={formatPercent(settings.fixedCostRate, currency.locale, 0)}
              />
              <Line
                label="Cartao"
                value={formatPercent(ref.params.cardFeeRate, currency.locale, 1)}
              />
              <Separator className="my-2" />
              <Line
                label="Receita liquida"
                value={formatMoney(refPrice.net, currency)}
              />
              <Line label="Markup" value={`${refPrice.markup.toFixed(2)}x`} />
              <Line
                label="Margem de contribuicao"
                value={formatMoney(refPrice.contributionMargin, currency)}
              />
              <p className="pt-2 text-xs text-muted-foreground">
                Custos fixos e lucro incidem sobre a receita liquida; cartao e
                comissao, sobre o valor bruto pago pelo cliente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
