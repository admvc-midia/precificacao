import Link from 'next/link';

import { AjudaLink } from '@/components/ajuda-link';
import { SubmitButton } from '@/components/action-form';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import { num, toChannelInput } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import { classifyMenuItem, MENU_CLASS_LABEL } from '@/lib/pricing/channels';
import { orderResult, salesByRecipe } from '@/lib/pricing/encomendas';
import { computeVariance } from '@/lib/pricing/stock';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import {
  currentPeriod,
  getCostedRecipes,
  getDeliveredOrders,
  getMovementTotals,
  getSalesPeriods,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Resultados do mes: o que as encomendas entregues deram, o CMV teorico
 * contra o real e a engenharia de cardapio.
 *
 * So le. As vendas vem todas das encomendas — a casa nao vende sem encomenda,
 * e o lancamento a mao que aqui havia so convidava a contar a mesma venda
 * duas vezes. (A tabela `SalesRecord`, que o guardava, foi apagada a 7/10/2026.)
 */
export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.periodo ?? '')
    ? sp.periodo!
    : currentPeriod();

  const [{ recipes, settings, currency, channels }, movimentos, periodos, encomendas] =
    await Promise.all([
      getCostedRecipes(),
      getMovementTotals(period),
      getSalesPeriods(),
      getDeliveredOrders(period),
    ]);

  // ---------------------------------------------------------------------
  // As encomendas do mes, uma a uma: o que entrou e o que sobrou.
  // ---------------------------------------------------------------------
  const resultados = encomendas.map((e) =>
    orderResult(
      {
        lines: e.lines.map((l) => ({
          qty: num(l.qty),
          unitPrice: num(l.unitPrice),
          listPrice: l.listPrice === null ? null : num(l.listPrice),
          unitFoodCost: num(l.unitFoodCost),
          unitPackagingCost: num(l.unitPackagingCost),
          unitDeliveryPackagingCost: num(l.unitDeliveryPackagingCost),
        })),
        fulfillment: e.fulfillment,
        paymentMethod: e.paymentMethod,
        channel: e.channel ? toChannelInput(e.channel) : null,
      },
      settings,
    ),
  );
  const receitaBruta = resultados.reduce((a, r) => a + r.gross, 0);
  const receitaLiquida = resultados.reduce((a, r) => a + r.net, 0);
  const lucro = resultados.reduce((a, r) => a + r.profit, 0);
  const descontos = resultados.reduce((a, r) => a + Math.max(0, r.discount), 0);

  const porProduto = salesByRecipe(
    encomendas.flatMap((e) =>
      e.lines.map((l) => ({
        recipeId: l.recipeId,
        qty: num(l.qty),
        unitPrice: num(l.unitPrice),
      })),
    ),
    settings,
  );

  // ---------------------------------------------------------------------
  // Custo teorico e margem de cada produto vendido, pela ficha de hoje.
  // ---------------------------------------------------------------------
  const ref = referenceChannel(channels);
  const linhas = recipes
    .filter((r) => r.kind === 'PRODUCT' && porProduto.has(r.id))
    .map((r) => {
      const vendido = porProduto.get(r.id)!;
      const preco = priceForRecipe(r, ref, settings);
      // A producao consome sempre as duas embalagens (ver explodeIngredients),
      // entao o custo teorico tem de as contar tambem, ou as duas contas nao
      // seriam comparaveis.
      const custoUnit = r.cost
        ? r.cost.foodCostPerUnit + r.cost.packagingCost + r.cost.deliveryPackagingCost
        : 0;
      return {
        recipe: r,
        qty: vendido.qty,
        gross: vendido.gross,
        theoreticalCost: custoUnit * vendido.qty,
        contribution: preco ? preco.contributionMargin : 0,
      };
    })
    .sort((a, b) => b.gross - a.gross);

  const totalQty = linhas.reduce((a, l) => a + l.qty, 0);
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

  const temVendas = encomendas.length > 0;
  const temMovimentos = movimentos.production > 0 || movimentos.waste > 0;

  // ---------------------------------------------------------------------
  // Engenharia de cardapio.
  // ---------------------------------------------------------------------
  const mediaContrib =
    linhas.length > 0 ? linhas.reduce((a, l) => a + l.contribution, 0) / linhas.length : 0;
  const mediaPop = linhas.length > 0 ? totalQty / linhas.length : 0;

  const itens: MenuItem[] = linhas.map((l) => {
    const klass = classifyMenuItem(l.contribution, mediaContrib, l.qty, mediaPop);
    return {
      id: l.recipe.id,
      name: l.recipe.name,
      qty: l.qty,
      popularityShare: totalQty > 0 ? l.qty / totalQty : 0,
      contribution: l.contribution,
      contributionLabel: formatMoney(l.contribution, currency),
      klass,
      klassLabel: MENU_CLASS_LABEL[klass],
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Resultados do mês
            <AjudaLink secao="vendas" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O que as encomendas entregues deram, e se o armazém bate com as fichas.
          </p>
        </div>

        <form className="flex items-end gap-2">
          <Field label="Mês" htmlFor="periodo">
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
          Meses com encomendas entregues:{' '}
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

      {/* ------------------------------------------------ as encomendas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Encomendas entregues"
          value={String(encomendas.length)}
          hint={`${totalQty} unidades`}
        />
        <StatTile
          label="Faturação"
          value={temVendas ? formatMoney(receitaBruta, currency) : '—'}
          hint={temVendas ? `${formatMoney(receitaLiquida, currency)} sem IVA` : undefined}
        />
        <StatTile
          label="Lucro"
          value={temVendas ? formatMoney(lucro, currency) : '—'}
          tone={!temVendas ? 'default' : lucro < 0 ? 'critical' : 'good'}
          hint={
            temVendas && receitaLiquida > 0
              ? `${formatPercent(lucro / receitaLiquida, currency.locale)} da receita sem IVA`
              : 'depois de insumos, custos fixos e taxas'
          }
        />
        <StatTile
          label="Descontos dados"
          value={temVendas ? formatMoney(descontos, currency) : '—'}
          tone={descontos > 0 ? 'warning' : 'default'}
          hint="Face ao preço de tabela"
        />
      </div>

      {!temVendas ? (
        <Alert tone="info">
          Nenhuma encomenda entregue em {period}. Os resultados aparecem aqui quando
          uma encomenda é marcada como <strong>Entregue</strong> em{' '}
          <Link href="/encomendas" className="underline">
            Encomendas
          </Link>
          .
        </Alert>
      ) : null}

      {/* ------------------------------------------------ CMV teorico x real */}
      <Card>
        <CardHeader>
          <CardTitle>CMV teórico e real</CardTitle>
          <CardDescription>
            O que as fichas dizem que devia sair do armazém, contra o que saiu mesmo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="CMV teórico"
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
                  : 'precisa de entregas e de produções registadas'
              }
            />
          </div>

          {movimentos.promo > 0 ? (
            <Alert tone="info">
              <strong>{formatMoney(movimentos.promo, currency)}</strong> saíram do
              armazém em amostras e divulgação este mês. Esse valor fica{' '}
              <strong>fora do CMV</strong> — é custo de marketing, não custo do que
              foi vendido. Somar os dois faria procurar desperdício onde não há.
            </Alert>
          ) : null}

          {!temVendas || !temMovimentos ? (
            <Alert tone="info">
              Para o CMV real fazer sentido são precisas duas coisas neste mês:{' '}
              {!temVendas ? <strong>encomendas entregues</strong> : 'encomendas entregues'} e{' '}
              {!temMovimentos ? (
                <strong>
                  produções registadas em{' '}
                  <Link href="/producao" className="underline">
                    Produção
                  </Link>
                </strong>
              ) : (
                'produções registadas'
              )}
              .
            </Alert>
          ) : (
            <Alert tone={variancia.gap > 0 ? 'warning' : 'info'}>
              {variancia.gap > 0 ? (
                <>
                  Saiu do armazém{' '}
                  <strong>{formatMoney(variancia.gap, currency)}</strong> mais do que as
                  fichas previam — {formatPercent(variancia.gapRate, currency.locale)} acima.
                  As causas habituais são porções maiores do que a ficha diz, desperdício
                  não registado, ou uma ficha técnica desatualizada.
                  {movimentos.waste > 0 ? (
                    <>
                      {' '}
                      Deste desvio, {formatMoney(movimentos.waste, currency)} estão
                      registados como quebra.
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  O consumo real ficou{' '}
                  <strong>{formatMoney(Math.abs(variancia.gap), currency)}</strong> abaixo
                  do previsto. Confira se todas as produções do mês foram registadas.
                </>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ o que se vendeu */}
      {linhas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>O que se vendeu em {period}</CardTitle>
            <CardDescription>Das encomendas entregues, com o preço combinado.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Faturação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.recipe.id}>
                    <TableCell>
                      <Link
                        href={`/precificacao/${l.recipe.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.recipe.name}
                      </Link>
                    </TableCell>
                    <TableNum>{l.qty}</TableNum>
                    <TableNum>{formatMoney(l.gross, currency)}</TableNum>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------ engenharia de cardapio */}
      <Card>
        <CardHeader>
          <CardTitle>Engenharia de cardápio</CardTitle>
          <CardDescription>
            Cruza o que vende com o que deixa margem. Só funciona com vendas — sem elas,
            todos os produtos pareceriam vender igual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A matriz aparece com as primeiras encomendas entregues do mês.
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
