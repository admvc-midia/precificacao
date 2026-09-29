import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { StatTile } from '@/components/dre-breakdown';
import {
  IngredientBreakdown,
  type BreakdownRow,
} from '@/components/ingredient-breakdown';
import { PriceExplorer } from '@/components/price-explorer';
import { RecipeQuickView, type QuickViewLine } from '@/components/recipe-quick-view';
import { ProductSwitcher } from '@/components/product-switcher';
import { Alert, Separator } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { saveRecipePricing } from '@/lib/actions/recipes';
import { buildCostContext, num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import { breakEvenPrice, channelContext } from '@/lib/pricing/channels';
import { computeRecipeCost, flattenRecipe } from '@/lib/pricing/cost';
import {
  analyzeManualPrice,
  priceFromTargetCmv,
  priceFromTargetMargin,
} from '@/lib/pricing/price';
import { getPricingData, getRecipeDetail } from '@/lib/queries';
import { formatBaseQty, formatCostPerUnit, type BaseUnit } from '@/lib/units';

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

  const saved = {
    mode: recipe.pricingMode,
    manualPrice: recipe.manualPrice === null ? null : num(recipe.manualPrice),
    targetCmv: recipe.targetCmv === null ? null : num(recipe.targetCmv),
    targetMargin: recipe.targetMargin === null ? null : num(recipe.targetMargin),
  };

  const reference = channels.find((c) => c.kind === 'COUNTER') ?? channels[0];
  const { params: refParams, costs: refCosts } = channelContext(
    cost,
    reference,
    settings,
  );
  const opts = { rounding: settings.rounding };

  const sugerido =
    saved.mode === 'MANUAL'
      ? analyzeManualPrice(saved.manualPrice ?? 0, refCosts, refParams)
      : saved.mode === 'TARGET_MARGIN'
        ? priceFromTargetMargin(
            refCosts,
            refParams,
            saved.targetMargin ?? settings.targetMargin,
            opts,
          )
        : priceFromTargetCmv(
            refCosts,
            refParams,
            saved.targetCmv ?? settings.targetCmv,
            opts,
          );

  const be = breakEvenPrice(refCosts, refParams);

  // ---------------------------------------------------------------------
  // Composicao por porcao: as duas vistas, ja formatadas para o cliente.
  // ---------------------------------------------------------------------
  const totalPorcao =
    cost.foodCostPerUnit + cost.packagingCost + cost.deliveryPackagingCost;

  const qtd = (v: number, u: BaseUnit) => formatBaseQty(v, u, currency.locale);
  const fatia = (c: number) => (totalPorcao > 0 ? c / totalPorcao : 0);

  const flat: BreakdownRow[] = flattenRecipe(id, 1, ctx).map((l) => ({
    id: l.ingredientId,
    name: l.name,
    via: l.via.length > 0 ? `via ${l.via.join(' › ')}` : undefined,
    plate: qtd(l.qtyBase, l.baseUnit),
    buy: qtd(l.qtyBaseWithFc, l.baseUnit),
    hasLoss: l.correctionFactor > 1.0001,
    unitCost: formatCostPerUnit(l.unitCost, l.baseUnit, currency),
    cost: formatMoney(l.cost, currency),
    share: fatia(l.cost),
    shareLabel: formatPercent(fatia(l.cost), currency.locale, 0),
    isPackaging: l.category === 'PACKAGING',
  }));

  // "Como na ficha": as linhas tal como escritas, mas por porcao em vez de
  // por lote — quem le quer saber o que vai num prato.
  const porPorcao = cost.yieldQty > 0 ? 1 / cost.yieldQty : 1;

  const asRecipe: BreakdownRow[] = [
    ...cost.lines.map((l) => {
      const base: BaseUnit =
        l.kind === 'RECIPE'
          ? (ctx.recipes.get(l.refId)?.yieldUnit ?? 'UN')
          : (ctx.ingredients.get(l.refId)
              ? BASE_FROM_INGREDIENT(ctx, l.refId)
              : 'UN');
      const custo = l.cost * porPorcao;
      return {
        id: l.refId,
        name: l.name,
        via: l.kind === 'RECIPE' ? 'preparacao base' : undefined,
        plate: qtd(l.qtyBase * porPorcao, base),
        buy: qtd(l.qtyBaseWithFc * porPorcao, base),
        hasLoss: l.correctionFactor > 1.0001,
        unitCost: formatCostPerUnit(l.unitCost, base, currency),
        cost: formatMoney(custo, currency),
        share: fatia(custo),
        shareLabel: formatPercent(fatia(custo), currency.locale, 0),
        isPackaging: false,
      };
    }),
    ...embalagens(recipe, cost, currency, fatia, qtd),
  ].sort((a, b) => b.share - a.share);

  // Vista rapida da ficha: o lote inteiro, como esta escrito nela.
  const quickLines: QuickViewLine[] = cost.lines.map((l, i) => {
    const item = recipe.items[i];
    const base =
      l.kind === 'RECIPE'
        ? (ctx.recipes.get(l.refId)?.yieldUnit ?? 'UN')
        : BASE_FROM_INGREDIENT(ctx, l.refId);

    return {
      id: item?.id ?? `${l.refId}-${i}`,
      name: l.name,
      detail:
        l.kind === 'RECIPE'
          ? 'preparacao base'
          : l.correctionFactor > 1
            ? `insumo · FC ${l.correctionFactor.toFixed(2)}`
            : 'insumo',
      qty: qtd(l.qtyBase, base),
      cost: formatMoney(l.cost, currency),
    };
  });

  const produtos = data.recipeRows
    .filter((r) => r.kind === 'PRODUCT')
    .map((r) => ({ id: r.id, name: r.name }));

  const pctValue = (v: number | null) =>
    v === null ? '' : (v * 100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href="/precificacao"
            className="text-sm text-muted-foreground hover:underline"
          >
            Precificacao
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
        </div>
        <ProductSwitcher current={id} products={produtos} />
      </header>

      {sugerido.warnings.map((w) => (
        <Alert key={w} tone={sugerido.feasible ? 'warning' : 'destructive'}>
          {w}
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Custo do produto"
          value={formatMoney(cost.productCost, currency)}
          hint={`Alimento ${formatMoney(cost.foodCostPerUnit, currency)} + embalagem ${formatMoney(cost.packagingCost, currency)}`}
        />
        <StatTile
          label="Break-even"
          value={be !== null ? formatMoney(be, currency) : '—'}
          hint={`Abaixo disto, ${reference.name} da prejuizo`}
        />
        <StatTile
          label="Rende"
          value={formatBaseQty(cost.yieldQty, cost.yieldUnit, currency.locale)}
          hint={
            <RecipeQuickView
              recipeId={id}
              recipeName={recipe.name}
              yieldLabel={formatBaseQty(cost.yieldQty, cost.yieldUnit, currency.locale)}
              packagingLabel={recipe.packaging?.name ?? null}
              lines={quickLines}
              totalLabel={formatMoney(cost.batchFoodCost, currency)}
              trigger={
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-primary"
                >
                  Ver ficha tecnica
                </Button>
              }
            />
          }
        />
      </div>

      <PriceExplorer
        cost={cost}
        settings={settings}
        channels={channels}
        saved={saved}
        currency={currency}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Composicao de uma porcao</CardTitle>
            <CardDescription>
              Quanto de cada insumo vai no prato, quanto e preciso comprar, e que
              fatia do custo cada um come.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IngredientBreakdown
              flat={flat}
              asRecipe={asRecipe}
              totalLabel={formatMoney(totalPorcao, currency)}
              productCostLabel={formatMoney(cost.productCost, currency)}
            />
          </CardContent>
        </Card>

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
                    <option value="TARGET_CMV">CMV alvo — parto do custo</option>
                    <option value="TARGET_MARGIN">
                      Margem alvo — parto do lucro que quero
                    </option>
                    <option value="MANUAL">Preco manual — ja sei quanto cobro</option>
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
                    defaultValue={pctValue(saved.targetCmv)}
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
                    defaultValue={pctValue(saved.targetMargin)}
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
                    defaultValue={saved.manualPrice === null ? '' : String(saved.manualPrice)}
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
              <Linha
                label="IVA"
                value={`${formatPercent(settings.vatRate, currency.locale, 0)} ${
                  settings.vatMode === 'INCLUDED' ? '(incluido)' : '(acrescido)'
                }`}
              />
              <Linha
                label="Custos fixos"
                value={formatPercent(settings.fixedCostRate, currency.locale, 0)}
              />
              <Linha
                label="Cartao"
                value={formatPercent(refParams.cardFeeRate, currency.locale, 1)}
              />
              <Separator className="my-2" />
              <Linha label="Markup" value={`${sugerido.markup.toFixed(2)}x`} />
              <Linha
                label="Margem de contribuicao"
                value={formatMoney(sugerido.contributionMargin, currency)}
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

/** Unidade base de um insumo referido por id. */
function BASE_FROM_INGREDIENT(
  ctx: ReturnType<typeof buildCostContext>,
  id: string,
): BaseUnit {
  const ing = ctx.ingredients.get(id);
  if (!ing) return 'UN';
  if (ing.purchaseUnit === 'KG' || ing.purchaseUnit === 'G') return 'G';
  if (ing.purchaseUnit === 'L' || ing.purchaseUnit === 'ML') return 'ML';
  return 'UN';
}

/** As embalagens nao estao em `cost.lines`; entram por porcao. */
function embalagens(
  recipe: NonNullable<Awaited<ReturnType<typeof getRecipeDetail>>>,
  cost: ReturnType<typeof computeRecipeCost>,
  currency: { currency: string; locale: string },
  fatia: (c: number) => number,
  qtd: (v: number, u: BaseUnit) => string,
): BreakdownRow[] {
  const linhas: BreakdownRow[] = [];

  const juntar = (
    nome: string | undefined,
    custo: number,
    sufixo: string,
    chave: string,
  ) => {
    if (!nome || custo <= 0) return;
    linhas.push({
      id: chave,
      name: nome,
      via: sufixo,
      plate: qtd(1, 'UN'),
      buy: qtd(1, 'UN'),
      hasLoss: false,
      unitCost: `${formatMoney(custo, currency)}/un`,
      cost: formatMoney(custo, currency),
      share: fatia(custo),
      shareLabel: `${(fatia(custo) * 100).toFixed(0)}%`,
      isPackaging: true,
    });
  };

  juntar(recipe.packaging?.name, cost.packagingCost, 'embalagem principal', 'pack');
  juntar(
    recipe.deliveryPackaging?.name,
    cost.deliveryPackagingCost,
    'embalagem de transporte',
    'dpack',
  );

  return linhas;
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
