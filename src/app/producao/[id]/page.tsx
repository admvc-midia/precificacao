import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BellRing, Check, Info, PackageCheck, ChefHat } from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  FormDialog,
  SubmitButton,
} from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { StatTile } from '@/components/dre-breakdown';
import {
  PurchaseChecklist,
  type ChecklistGroup,
} from '@/components/purchase-checklist';
import { Alert, Badge } from '@/components/ui/badge';
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
import {
  addOrderLine,
  deleteOrderLine,
  freezePurchaseList,
  updateOrderLine,
} from '@/lib/actions/production';
import { receivePurchase, recordProduction } from '@/lib/actions/stock';
import { buildCostContext, num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  buildPurchaseList,
  demandConsumptionCost,
  lowStockOutside,
  type LowOutsideLine,
  type PurchaseList,
} from '@/lib/pricing/purchase';
import { bestOfferForNeed } from '@/lib/pricing/offers';
import { getPricingData, getProductionOrder, getSuppliers } from '@/lib/queries';
import { formatBaseQty, UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function OrdemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, data, suppliers] = await Promise.all([
    getProductionOrder(id),
    getPricingData(),
    getSuppliers(),
  ]);
  if (!order) notFound();

  const { currency } = data;
  const ctx = buildCostContext(data.ingredientRows, data.recipeRows);
  const products = data.recipeRows.filter((r) => r.kind === 'PRODUCT');

  const demand = order.lines.map((l) => ({
    recipeId: l.recipeId,
    qty: num(l.qty),
  }));

  let list: PurchaseList | null = null;
  let consumption = 0;
  let error: string | null = null;
  // Lembrete: o que esta no minimo e esta ordem nao usa. Nao entra na compra.
  let aAcabar: LowOutsideLine[] = [];
  // Ha compra so para repor o minimo? Muda a explicacao da sobra.
  let paraMinimo = false;

  if (demand.length > 0) {
    try {
      list = buildPurchaseList(demand, ctx);
      consumption = demandConsumptionCost(demand, ctx);
      aAcabar = lowStockOutside(list, ctx);
      paraMinimo = list.lines.some((l) => l.forMinimumBase > 0);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  // A lista guardada e uma fotografia dos precos do dia em que se planeou.
  // Comparar com a lista viva mostra se a conta se mexeu desde entao.
  const frozenTotal = order.listLines.reduce((a, l) => a + num(l.estimatedCost), 0);
  const hasFrozen = order.listLines.length > 0;
  const drift = hasFrozen && list ? list.totalCost - frozenTotal : 0;

  // A morada e o telefone nao viajam no PurchaseLine, mas sao exatamente o
  // que se quer no supermercado: onde ir e a quem ligar se faltar algo.
  const porFornecedor = new Map(suppliers.map((s) => [s.id, s]));

  // Precos alternativos por insumo, para a lista dizer onde ficava mais barato.
  const ofertasPorInsumo = new Map(
    data.ingredientRows.map((i) => [
      i.id,
      i.offers.map((o) => ({
        id: o.id,
        supplierId: o.supplierId,
        supplierName: o.supplier?.name ?? 'Sem fornecedor',
        purchasePrice: num(o.purchasePrice),
        purchaseQty: num(o.purchaseQty),
        purchaseUnit: o.purchaseUnit,
        inUse: o.inUse,
      })),
    ]),
  );

  const checklistGroups: ChecklistGroup[] = (list?.bySupplier ?? []).map((group) => {
    const sup = group.supplierId ? porFornecedor.get(group.supplierId) : undefined;
    return {
      id: group.supplierId ?? 'sem-fornecedor',
      supplier: group.supplierName,
      address: sup?.address ?? null,
      phone: sup?.phone ?? null,
      total: formatMoney(group.total, currency),
      items: group.lines.map((l) => ({
        id: l.ingredient.id,
        name: l.ingredient.name,
        // Como na aba Compras: "2× 0,395 kg", com virgula e na unidade de exibicao.
        buy: `${l.packsToBuy}× ${formatBaseQty(l.packSizeBase, l.baseUnit, currency)}`,
        cost: formatMoney(l.cost, currency),
        costValue: l.cost,
        detail: [
          `preciso ${formatBaseQty(l.requiredBase, l.baseUnit, currency)}`,
          l.stockBase > 0
            ? `tenho ${formatBaseQty(l.stockBase, l.baseUnit, currency)}`
            : null,
          `falta ${formatBaseQty(l.missingBase, l.baseUnit, currency)}`,
          // Sem isto a lista pedia mais do que a producao gasta sem dizer porque.
          l.forMinimumBase > 0
            ? `inclui ${formatBaseQty(l.forMinimumBase, l.baseUnit, currency)} para manter o minimo`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        leftover:
          l.leftoverBase > 0
            ? `sobram ${formatBaseQty(l.leftoverBase, l.baseUnit, currency)}`
            : undefined,
        betterPrice: melhorPreco(l),
      })),
    };
  });

  /**
   * Onde esta compra ficava mais barata.
   *
   * Compara pelo **custo total desta necessidade**, nao pelo preco por grama:
   * comprar 1 kg num pacote de 5 kg pode sair mais caro do que num pacote de
   * 1 kg mais caro por grama.
   */
  function melhorPreco(l: {
    ingredient: { id: string };
    missingBase: number;
    cost: number;
  }) {
    const ofertas = ofertasPorInsumo.get(l.ingredient.id) ?? [];
    if (ofertas.length === 0) return undefined;

    const melhor = bestOfferForNeed(l.missingBase, ofertas);
    if (!melhor) return undefined;

    const poupanca = l.cost - melhor.cheapest.cost;
    // Menos de um centimo nao vale um aviso.
    if (poupanca <= 0.005) return undefined;

    const q = melhor.cheapest;
    return {
      supplier: q.offer.supplierName,
      saving: formatMoney(poupanca, currency),
      detail: `${q.packs}x ${num(q.offer.purchaseQty)} ${UNIT_LABEL[q.offer.purchaseUnit]} por ${formatMoney(q.cost, currency)}`,
    };
  }

  const dateFmt = new Intl.DateTimeFormat(currency.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/producao" className="text-sm text-muted-foreground hover:underline">
            Producao
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">{order.name}
            <AjudaLink secao="producao" />
          </h1>
          {order.dueAt ? (
            <Badge variant="secondary">{dateFmt.format(order.dueAt)}</Badge>
          ) : null}
          {order.promotional ? (
            <Badge variant="warning">para oferecer</Badge>
          ) : null}
        </div>
        {order.notes ? (
          <p className="text-sm text-muted-foreground">{order.notes}</p>
        ) : null}
      </header>

      {error ? <Alert tone="destructive">{error}</Alert> : null}

      {list ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="A comprar hoje"
            value={formatMoney(list.totalCost, currency)}
            hint={`${list.bySupplier.length} fornecedor(es)`}
          />
          <StatTile
            label="Custo da producao"
            value={formatMoney(consumption, currency)}
            hint="O que estes produtos consomem, incluindo o que ja esta em casa"
          />
          <StatTile
            label="Fica em despensa"
            value={formatMoney(list.leftoverCost, currency)}
            tone={list.leftoverCost > list.theoreticalCost ? 'warning' : 'default'}
            hint={
              paraMinimo
                ? 'Sobra das embalagens inteiras e reposicao do minimo'
                : 'Sobra das embalagens inteiras'
            }
          />
          <StatTile
            label="Nao precisa comprar"
            value={String(list.coveredByStock.length)}
            tone={list.coveredByStock.length > 0 ? 'good' : 'default'}
            hint="Ja tem no estoque"
          />
        </div>
      ) : null}

      {hasFrozen && list ? (
        <Alert tone={Math.abs(drift) > 0.005 ? 'warning' : 'info'}>
          Lista guardada em {dateFmt.format(order.updatedAt)} por{' '}
          <strong>{formatMoney(frozenTotal, currency)}</strong>.{' '}
          {Math.abs(drift) <= 0.005 ? (
            'Os precos nao se mexeram desde entao.'
          ) : (
            <>
              Com os precos de hoje a mesma compra custa{' '}
              <strong>{formatMoney(list.totalCost, currency)}</strong> —{' '}
              {drift > 0 ? 'mais' : 'menos'}{' '}
              {formatMoney(Math.abs(drift), currency)}
              {frozenTotal > 0
                ? ` (${formatPercent(Math.abs(drift) / frozenTotal, currency.locale)})`
                : ''}
              .
            </>
          )}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>O que produzir</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {order.lines.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Ordem vazia. Adicione o primeiro produto ao lado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Porcoes</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Link
                            href={`/fichas/${line.recipeId}`}
                            className="font-medium hover:underline"
                          >
                            {line.recipe.name}
                          </Link>
                        </TableCell>
                        <TableNum>{num(line.qty)}</TableNum>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <FormDialog
                              action={updateOrderLine}
                              title={`Quantidade de ${line.recipe.name}`}
                              description="Quantas porcoes produzir. A lista de compras e recalculada."
                              submitLabel="Guardar"
                            >
                              <input type="hidden" name="id" value={line.id} />
                              <Field label="Porcoes" htmlFor={`oq-${line.id}`}>
                                <Input
                                  id={`oq-${line.id}`}
                                  name="qty"
                                  inputMode="decimal"
                                  defaultValue={String(num(line.qty))}
                                  required
                                />
                              </Field>
                            </FormDialog>

                            <ConfirmDelete
                              action={deleteOrderLine}
                              fields={{ id: line.id, orderId: id }}
                              title={`Tirar "${line.recipe.name}" da ordem?`}
                              description="A lista de compras e recalculada sem este produto."
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {list && checklistGroups.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Lista de compras</h2>
                <p className="text-sm text-muted-foreground">
                  Dividida por loja. Toque num item para o riscar enquanto compra —
                  o progresso fica guardado neste telemovel.
                </p>
              </div>

              <PurchaseChecklist
                orderId={id}
                groups={checklistGroups}
                currency={currency}
              />

              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <p>
                  Dos {formatMoney(list.totalCost, currency)} a pagar, apenas{' '}
                  {formatMoney(list.theoreticalCost, currency)} sao consumidos por
                  esta producao — o resto fica em despensa
                  {paraMinimo
                    ? ', para repor o estoque minimo e porque nao se compra fracao de embalagem'
                    : ' porque nao se compra fracao de embalagem'}
                  . Esse dinheiro nao se perde, mas sai da caixa hoje.
                </p>
              </div>
            </section>
          ) : null}

          {list && list.coveredByStock.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                  Nao precisa comprar — ja tem em casa
                </CardTitle>
                <CardDescription>
O que voce ja tem no estoque chega para esta producao, entao estes
                  ficaram fora da lista de compras acima.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Preciso</TableHead>
                      <TableHead className="text-right">Tenho</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.coveredByStock.map((l) => (
                      <TableRow key={l.ingredient.id}>
                        <TableCell className="font-medium">
                          {l.ingredient.name}
                        </TableCell>
                        <TableNum className="text-muted-foreground">
                          {formatBaseQty(l.requiredBase, l.baseUnit, currency)}
                        </TableNum>
                        <TableNum>
                          {formatBaseQty(l.stockBase, l.baseUnit, currency)}
                        </TableNum>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {aAcabar.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                  Tambem a acabar
                </CardTitle>
                <CardDescription>
                  Estes estao no minimo ou abaixo, mas esta producao nao os usa.
                  Nao entram na compra acima nem no &quot;Recebi esta compra&quot; —
                  sao so um lembrete, para aproveitar a mesma volta.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Tenho</TableHead>
                      <TableHead className="text-right">Minimo</TableHead>
                      <TableHead className="text-right">Falta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aAcabar.map((l) => (
                      <TableRow key={l.ingredient.id}>
                        <TableCell className="font-medium">
                          {l.ingredient.name}
                          {l.ingredient.supplierName ? (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {l.ingredient.supplierName}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableNum>
                          {formatBaseQty(l.stockBase, l.baseUnit, currency)}
                        </TableNum>
                        <TableNum className="text-muted-foreground">
                          {formatBaseQty(l.minBase, l.baseUnit, currency)}
                        </TableNum>
                        <TableNum className="font-medium">
                          {l.missingBase > 0
                            ? formatBaseQty(l.missingBase, l.baseUnit, currency)
                            : 'no minimo'}
                        </TableNum>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Adicionar produto</CardTitle>
              <CardDescription>
                Pedir o mesmo produto duas vezes soma as quantidades.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={addOrderLine}>
                <input type="hidden" name="orderId" value={id} />

                <Field label="Produto" htmlFor="line-recipe">
                  <Select id="line-recipe" name="recipeId" required defaultValue="">
                    <option value="" disabled>
                      Escolha um produto…
                    </option>
                    {products.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Quantidade a produzir" htmlFor="line-qty">
                  <Input
                    id="line-qty"
                    name="qty"
                    inputMode="decimal"
                    placeholder="100"
                    required
                  />
                </Field>

                <SubmitButton>Adicionar</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fechar o ciclo</CardTitle>
              <CardDescription>
                E aqui que o estoque deixa de ser um palpite.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <ActionForm action={receivePurchase}>
                  <input type="hidden" name="orderId" value={id} />
                  <SubmitButton
                    variant={order.receivedAt ? 'outline' : 'default'}
                    disabled={Boolean(order.receivedAt) || !list}
                    className="w-full"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {order.receivedAt ? 'Compra ja recebida' : 'Recebi esta compra'}
                  </SubmitButton>
                </ActionForm>
                <p className="text-xs text-muted-foreground">
                  {order.receivedAt
                    ? `Deu entrada em ${dateFmt.format(order.receivedAt)}.`
                    : 'Da entrada no estoque das embalagens inteiras que a lista manda comprar.'}
                </p>
              </div>

              <div className="space-y-2">
                <ActionForm action={recordProduction}>
                  <input type="hidden" name="orderId" value={id} />
                  <SubmitButton
                    variant={order.producedAt ? 'outline' : 'secondary'}
                    disabled={Boolean(order.producedAt) || order.lines.length === 0}
                    className="w-full"
                  >
                    <ChefHat className="h-4 w-4" />
                    {order.producedAt
                      ? order.promotional
                        ? 'Amostras ja registadas'
                        : 'Producao ja registada'
                      : order.promotional
                        ? 'Ofereci'
                        : 'Produzi'}
                  </SubmitButton>
                </ActionForm>
                <p className="text-xs text-muted-foreground">
                  {order.producedAt
                    ? `Registada em ${dateFmt.format(order.producedAt)}.`
                    : order.promotional
                      ? 'Tira do estoque o que foi oferecido. Entra como custo de divulgacao, nao no CMV.'
                      : 'Tira do estoque o que as fichas dizem que esta producao consome, ja com o fator de correcao.'}
                </p>
              </div>

              <p className="border-t pt-3 text-xs text-muted-foreground">
                Ver o resultado em{' '}
                <Link href="/estoque" className="text-primary hover:underline">
                  Estoque
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          {list && list.bySupplier.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Guardar a lista</CardTitle>
                <CardDescription>
                  Congela os precos e o estoque de hoje, para comparar depois.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={freezePurchaseList}>
                  <input type="hidden" name="orderId" value={id} />
                  <SubmitButton variant="outline">
                    {hasFrozen ? 'Atualizar a lista guardada' : 'Guardar lista'}
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
