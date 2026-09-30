import Link from 'next/link';
import { Info } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { StatTile } from '@/components/dre-breakdown';
import { MenuMatrix, type MenuItem } from '@/components/menu-matrix';
import { Alert } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { saveSales } from '@/lib/actions/sales';
import { num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  channelContext,
  classifyMenuItem,
  MENU_CLASS_LABEL,
} from '@/lib/pricing/channels';
import {
  analyzeManualPrice,
  priceFromTargetCmv,
  priceFromTargetMargin,
} from '@/lib/pricing/price';
import { computeVariance } from '@/lib/pricing/stock';
import type { PriceResult } from '@/lib/pricing/types';
import {
  currentPeriod,
  getCostedRecipes,
  getMovementTotals,
  getSales,
  getSalesPeriods,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.periodo ?? '')
    ? sp.periodo!
    : currentPeriod();

  const [{ recipes, settings, currency, channels }, vendas, movimentos, periodos] =
    await Promise.all([
      getCostedRecipes(),
      getSales(period),
      getMovementTotals(period),
      getSalesPeriods(),
    ]);

  const produtos = recipes.filter((r) => r.kind === 'PRODUCT');
  const reference = channels.find((c) => c.kind === 'COUNTER') ?? channels[0];
  const vendidoPor = new Map(vendas.map((v) => [v.recipeId, v]));

  // ---------------------------------------------------------------------
  // Preco e custo de cada produto, para cruzar com as vendas.
  // ---------------------------------------------------------------------
  const linhas = produtos.map((r) => {
    let resultado: PriceResult | null = null;

    if (r.cost && reference) {
      const { params, costs } = channelContext(r.cost, reference, settings);
      const opts = { rounding: settings.rounding };
      resultado =
        r.pricingMode === 'MANUAL'
          ? analyzeManualPrice(r.manualPrice ?? 0, costs, params)
          : r.pricingMode === 'TARGET_MARGIN'
            ? priceFromTargetMargin(
                costs,
                params,
                r.targetMargin ?? settings.targetMargin,
                opts,
              )
            : priceFromTargetCmv(costs, params, r.targetCmv ?? settings.targetCmv, opts);
    }

    const venda = vendidoPor.get(r.id);
    const qty = venda ? num(venda.qty) : 0;
    const receitaBruta = venda?.revenue !== null && venda?.revenue !== undefined
      ? num(venda.revenue)
      : resultado
        ? resultado.gross * qty
        : 0;

    // A producao consome sempre as duas embalagens (ver explodeIngredients),
    // entao o custo teorico tem de as contar tambem, ou as duas contas nao
    // seriam comparaveis.
    const custoUnit = r.cost
      ? r.cost.foodCostPerUnit + r.cost.packagingCost + r.cost.deliveryPackagingCost
      : 0;

    return {
      recipe: r,
      result: resultado,
      qty,
      revenueGross: receitaBruta,
      unitCost: custoUnit,
      theoreticalCost: custoUnit * qty,
      contribution: resultado ? resultado.contributionMargin : 0,
    };
  });

  const totalQty = linhas.reduce((a, l) => a + l.qty, 0);
  const receitaBruta = linhas.reduce((a, l) => a + l.revenueGross, 0);
  const receitaLiquida =
    settings.vatMode === 'INCLUDED' ? receitaBruta / (1 + settings.vatRate) : receitaBruta;
  const custoTeorico = linhas.reduce((a, l) => a + l.theoreticalCost, 0);

  const variancia = computeVariance({
    theoreticalCost: custoTeorico,
    actualProductionCost: movimentos.production,
    wasteCost: movimentos.waste,
    // O que foi oferecido nao entra no CMV: saiu do armazem, mas nao houve
    // venda a que o associar.
    promoCost: movimentos.promo,
    netRevenue: receitaLiquida,
  });

  const temVendas = totalQty > 0;
  const temMovimentos = movimentos.production > 0 || movimentos.waste > 0;

  // ---------------------------------------------------------------------
  // Engenharia de cardapio — agora com o eixo da popularidade a funcionar.
  // ---------------------------------------------------------------------
  const vendidos = linhas.filter((l) => l.qty > 0);
  const mediaContrib =
    vendidos.length > 0
      ? vendidos.reduce((a, l) => a + l.contribution, 0) / vendidos.length
      : 0;
  const mediaPop = vendidos.length > 0 ? totalQty / vendidos.length : 0;

  const itens: MenuItem[] = vendidos.map((l) => ({
    id: l.recipe.id,
    name: l.recipe.name,
    qty: l.qty,
    popularityShare: totalQty > 0 ? l.qty / totalQty : 0,
    contribution: l.contribution,
    contributionLabel: formatMoney(l.contribution, currency),
    klass: classifyMenuItem(l.contribution, mediaContrib, l.qty, mediaPop),
    klassLabel: MENU_CLASS_LABEL[
      classifyMenuItem(l.contribution, mediaContrib, l.qty, mediaPop)
    ],
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendas e CMV real
            <AjudaLink secao="vendas" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O que as fichas dizem que devia custar, contra o que saiu mesmo do
            armazem.
          </p>
        </div>

        <form className="flex items-end gap-2">
          <Field label="Mes" htmlFor="periodo">
            <Input
              id="periodo"
              name="periodo"
              type="month"
              defaultValue={period}
              className="w-44"
            />
          </Field>
          <SubmitButton variant="outline">Ver</SubmitButton>
        </form>
      </header>

      {periodos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Meses com vendas lancadas:{' '}
          {periodos.map((p, i) => (
            <span key={p}>
              {i > 0 ? ' · ' : ''}
              <Link href={`/vendas?periodo=${p}`} className="text-primary hover:underline">
                {p}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {/* ------------------------------------------------ CMV teorico x real */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Receita liquida"
          value={temVendas ? formatMoney(receitaLiquida, currency) : '—'}
          hint={`${totalQty} unidades vendidas`}
        />
        <StatTile
          label="CMV teorico"
          value={
            temVendas && receitaLiquida > 0
              ? formatPercent(variancia.theoreticalCmv, currency.locale)
              : '—'
          }
          hint={formatMoney(custoTeorico, currency)}
        />
        <StatTile
          label="CMV real"
          value={
            temMovimentos && receitaLiquida > 0
              ? formatPercent(variancia.actualCmv, currency.locale)
              : '—'
          }
          tone={variancia.cmvGapPoints > 0.02 ? 'critical' : 'good'}
          hint={formatMoney(variancia.actualCost, currency)}
        />
        <StatTile
          label="Desvio"
          value={
            temVendas && temMovimentos
              ? `${variancia.gap >= 0 ? '+' : ''}${formatMoney(variancia.gap, currency)}`
              : '—'
          }
          tone={variancia.gap > 0 ? 'critical' : 'good'}
          hint={
            temVendas && temMovimentos
              ? `${formatPercent(Math.abs(variancia.cmvGapPoints), currency.locale, 1)} de CMV`
              : 'precisa de vendas e de producoes registadas'
          }
        />
      </div>

      {movimentos.promo > 0 ? (
        <Alert tone="info">
          <strong>{formatMoney(movimentos.promo, currency)}</strong> sairam do
          armazem em amostras e divulgacao este mes. Esse valor fica{' '}
          <strong>fora do CMV</strong> — e custo de marketing, nao custo do que
          foi vendido. Somar os dois faria procurar desperdicio onde nao ha.
        </Alert>
      ) : null}

      {!temVendas || !temMovimentos ? (
        <Alert tone="info">
          Para o CMV real fazer sentido sao precisas duas coisas neste mes:{' '}
          {!temVendas ? <strong>vendas lancadas</strong> : 'vendas lancadas'} e{' '}
          {!temMovimentos ? (
            <strong>
              producoes registadas em{' '}
              <Link href="/producao" className="underline">
                Producao
              </Link>
            </strong>
          ) : (
            'producoes registadas'
          )}
          .
        </Alert>
      ) : (
        <Alert tone={variancia.gap > 0 ? 'warning' : 'info'}>
          {variancia.gap > 0 ? (
            <>
              Saiu do armazem{' '}
              <strong>{formatMoney(variancia.gap, currency)}</strong> mais do que as
              fichas previam — {formatPercent(variancia.gapRate, currency.locale)} acima.
              As causas habituais sao porcoes maiores do que a ficha diz, desperdicio
              nao registado, ou uma ficha tecnica desatualizada.
              {movimentos.waste > 0 ? (
                <>
                  {' '}
                  Deste desvio, {formatMoney(movimentos.waste, currency)} estao
                  registados como quebra.
                </>
              ) : null}
            </>
          ) : (
            <>
              O consumo real ficou{' '}
              <strong>{formatMoney(Math.abs(variancia.gap), currency)}</strong> abaixo
              do previsto. Confira se todas as producoes do mes foram registadas.
            </>
          )}
        </Alert>
      )}

      {/* ------------------------------------------------ lancar vendas */}
      <Card>
        <CardHeader>
          <CardTitle>Vendas de {period}</CardTitle>
          <CardDescription>
            Quantas unidades de cada produto sairam. A receita e opcional: em
            branco, usa o preco calculado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto final cadastrado.
            </p>
          ) : (
            <ActionForm action={saveSales}>
              <input type="hidden" name="period" value={period} />

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 text-left font-medium">Produto</th>
                      <th className="px-3 py-2 text-right font-medium">Preco</th>
                      <th className="px-3 py-2 text-left font-medium">Unidades</th>
                      <th className="py-2 pl-3 text-left font-medium">
                        Receita (opcional)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.recipe.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/precificacao/${l.recipe.id}`}
                            className="font-medium hover:underline"
                          >
                            {l.recipe.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {l.result?.feasible
                            ? formatMoney(l.result.price, currency)
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            name={`qty:${l.recipe.id}`}
                            inputMode="decimal"
                            defaultValue={l.qty > 0 ? String(l.qty) : ''}
                            placeholder="0"
                            aria-label={`Unidades vendidas de ${l.recipe.name}`}
                            className="w-24"
                          />
                        </td>
                        <td className="py-2 pl-3">
                          <Input
                            name={`rev:${l.recipe.id}`}
                            inputMode="decimal"
                            defaultValue={
                              vendidoPor.get(l.recipe.id)?.revenue != null
                                ? String(num(vendidoPor.get(l.recipe.id)!.revenue))
                                : ''
                            }
                            placeholder="calculada"
                            aria-label={`Receita de ${l.recipe.name}`}
                            className="w-32"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Deixar a quantidade em branco apaga o lancamento desse produto — nao
                e o mesmo que lancar zero.
              </p>

              <SubmitButton>Guardar vendas de {period}</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ engenharia de cardapio */}
      <Card>
        <CardHeader>
          <CardTitle>Engenharia de cardapio</CardTitle>
          <CardDescription>
            Cruza o que vende com o que deixa margem. So funciona com vendas
            lancadas — sem elas, todos os produtos pareceriam vender igual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Lance as vendas deste mes para ver a matriz.
            </p>
          ) : (
            <MenuMatrix
              items={itens}
              avgContribution={mediaContrib}
              avgContributionLabel={formatMoney(mediaContrib, currency)}
              avgPopularityShare={itens.length > 0 ? 1 / itens.length : 0}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
