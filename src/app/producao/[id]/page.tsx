import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Info, Store, Trash2 } from 'lucide-react';

import { ActionForm, DeleteButton, SubmitButton } from '@/components/action-form';
import { StatTile } from '@/components/dre-breakdown';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import {
  addOrderLine,
  deleteOrderLine,
  freezePurchaseList,
} from '@/lib/actions/production';
import { buildCostContext, num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  buildPurchaseList,
  demandConsumptionCost,
  type PurchaseList,
} from '@/lib/pricing/purchase';
import { getPricingData, getProductionOrder } from '@/lib/queries';
import { formatBaseQty, UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function OrdemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, data] = await Promise.all([getProductionOrder(id), getPricingData()]);
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

  if (demand.length > 0) {
    try {
      list = buildPurchaseList(demand, ctx);
      consumption = demandConsumptionCost(demand, ctx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  // A lista guardada e uma fotografia dos precos do dia em que se planeou.
  // Comparar com a lista viva mostra se a conta se mexeu desde entao.
  const frozenTotal = order.listLines.reduce((a, l) => a + num(l.estimatedCost), 0);
  const hasFrozen = order.listLines.length > 0;
  const drift = hasFrozen && list ? list.totalCost - frozenTotal : 0;

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
          <h1 className="text-2xl font-semibold tracking-tight">{order.name}</h1>
          {order.dueAt ? (
            <Badge variant="secondary">{dateFmt.format(order.dueAt)}</Badge>
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
            hint="Sobra das embalagens inteiras"
          />
          <StatTile
            label="Ja coberto pelo estoque"
            value={String(list.coveredByStock.length)}
            tone={list.coveredByStock.length > 0 ? 'good' : 'default'}
            hint="Insumos que nao precisa comprar"
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
                          <ActionForm action={deleteOrderLine} showSuccess={false}>
                            <input type="hidden" name="id" value={line.id} />
                            <input type="hidden" name="orderId" value={id} />
                            <DeleteButton
                              confirmMessage={`Tirar "${line.recipe.name}" da ordem?`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </DeleteButton>
                          </ActionForm>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {list && list.bySupplier.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Lista de compras</CardTitle>
                <CardDescription>
                  Dividida por loja, na ordem da volta das compras.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-0">
                {list.bySupplier.map((group) => (
                  <div key={group.supplierId ?? 'none'}>
                    <div className="flex items-center justify-between gap-3 border-y bg-muted/40 px-6 py-2">
                      <span className="flex items-center gap-2 font-medium">
                        <Store className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {group.supplierName}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatMoney(group.total, currency)}
                      </span>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Insumo</TableHead>
                          <TableHead className="text-right">Preciso</TableHead>
                          <TableHead className="text-right">Tenho</TableHead>
                          <TableHead className="text-right">Falta</TableHead>
                          <TableHead className="text-right">Comprar</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.lines.map((l) => (
                          <TableRow key={l.ingredient.id}>
                            <TableCell>
                              <div className="font-medium">{l.ingredient.name}</div>
                              {l.leftoverBase > 0 ? (
                                <div className="text-xs text-muted-foreground">
                                  sobram {formatBaseQty(l.leftoverBase, l.baseUnit, currency.locale)}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableNum className="text-muted-foreground">
                              {formatBaseQty(l.requiredBase, l.baseUnit, currency.locale)}
                            </TableNum>
                            <TableNum className="text-muted-foreground">
                              {l.stockBase > 0
                                ? formatBaseQty(l.stockBase, l.baseUnit, currency.locale)
                                : '—'}
                            </TableNum>
                            <TableNum>
                              {formatBaseQty(l.missingBase, l.baseUnit, currency.locale)}
                            </TableNum>
                            <TableNum className="font-medium">
                              {l.packsToBuy}x {num(l.ingredient.purchaseQty)}{' '}
                              {UNIT_LABEL[l.ingredient.purchaseUnit]}
                            </TableNum>
                            <TableNum className="font-medium">
                              {formatMoney(l.cost, currency)}
                            </TableNum>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                <Table>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total da compra</TableCell>
                      <TableNum className="text-base font-semibold">
                        {formatMoney(list.totalCost, currency)}
                      </TableNum>
                    </TableRow>
                  </TableFooter>
                </Table>

                <div className="flex items-start gap-2 px-6 pb-6 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <p>
                    Dos {formatMoney(list.totalCost, currency)} a pagar, apenas{' '}
                    {formatMoney(list.theoreticalCost, currency)} sao consumidos por
                    esta producao — o resto fica em despensa porque nao se compra
                    fracao de embalagem. Esse dinheiro nao se perde, mas sai da caixa
                    hoje.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {list && list.coveredByStock.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                  Ja tem em casa
                </CardTitle>
                <CardDescription>
                  O estoque cobre estes insumos por inteiro.
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
                          {formatBaseQty(l.requiredBase, l.baseUnit, currency.locale)}
                        </TableNum>
                        <TableNum>
                          {formatBaseQty(l.stockBase, l.baseUnit, currency.locale)}
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
