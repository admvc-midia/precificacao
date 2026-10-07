import Link from 'next/link';
import { Download } from 'lucide-react';

import { SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { StatTile } from '@/components/dre-breakdown';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { num, toChannelInput, toGlobalSettings } from '@/lib/mappers';
import { currencyOf, formatMoney, formatPercent, type CurrencyConfig } from '@/lib/money';
import {
  customerStats,
  DIAS_SEM_ENCOMENDAR,
  formatRating,
  productRatings,
  SOURCE_LABEL,
} from '@/lib/pricing/clientes';
import { daysBetween, grossOf, nowInLisbon } from '@/lib/pricing/encomendas';
import { monthsBetween, salesReport } from '@/lib/pricing/relatorio';
import {
  currentPeriod,
  getCustomersWithOrders,
  getDeliveredOrdersBetween,
  getRatedLines,
  getSettings,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const mesCurto = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
const mesLongo = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const diaFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' });

/** "2026-10" menos n meses. */
function recuar(periodo: string, n: number): string {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

function dataDoMes(periodo: string): Date {
  return new Date(`${periodo}-01T00:00:00Z`);
}

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const atual = currentPeriod();
  let ate = MES.test(sp.ate ?? '') ? sp.ate! : atual;
  let de = MES.test(sp.de ?? '') ? sp.de! : recuar(ate, 5);
  if (de > ate) [de, ate] = [ate, de];

  const [encomendas, settingsRow, avaliadas, clientes] = await Promise.all([
    getDeliveredOrdersBetween(de, ate),
    getSettings(),
    getRatedLines(),
    getCustomersWithOrders(),
  ]);
  const settings = toGlobalSettings(settingsRow);
  const currency = currencyOf(settingsRow);
  const meses = monthsBetween(de, ate);

  const r = salesReport(
    encomendas.map((e) => ({
      deliveredAt: e.deliveredAt!,
      fulfillment: e.fulfillment,
      paymentMethod: e.paymentMethod,
      channel: e.channel ? toChannelInput(e.channel) : null,
      customer: e.customer,
      lines: e.lines.map((l) => ({
        recipeId: l.recipeId,
        recipeName: l.recipe.name,
        qty: num(l.qty),
        unitPrice: num(l.unitPrice),
        listPrice: l.listPrice === null ? null : num(l.listPrice),
        unitFoodCost: num(l.unitFoodCost),
        unitPackagingCost: num(l.unitPackagingCost),
        unitDeliveryPackagingCost: num(l.unitDeliveryPackagingCost),
      })),
    })),
    settings,
    meses,
  );
  const notas = productRatings(avaliadas);

  // Quem esta a esfriar e de todo o historico, nao so do periodo: e a lista de
  // a quem ligar, e um cliente de ha quatro meses nao entra num periodo de tres.
  const hoje = nowInLisbon();
  const esfriar = clientes
    .map((c) => ({
      c,
      s: customerStats(
        c.orders.map((o) => ({
          status: o.status,
          dueAt: o.dueAt,
          deliveredAt: o.deliveredAt,
          rating: o.rating,
          gross: grossOf(o.lines.reduce((a, l) => a + num(l.qty) * num(l.unitPrice), 0), settings),
        })),
      ),
    }))
    .filter((x) => x.s.lastOrder && daysBetween(x.s.lastOrder, hoje) > DIAS_SEM_ENCOMENDAR)
    .sort((a, b) => b.s.spent - a.s.spent)
    .slice(0, 10);

  const voltaram = r.byCustomer.filter((c) => c.orders > 1).length;
  const temDados = r.total.orders > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório de vendas
            <AjudaLink secao="relatorio" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Encomendas entregues de {mesLongo.format(dataDoMes(de))} a{' '}
            {mesLongo.format(dataDoMes(ate))}.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <Field label="De" htmlFor="de">
            <Input id="de" name="de" type="month" defaultValue={de} className="w-40" />
          </Field>
          <Field label="Até" htmlFor="ate">
            <Input id="ate" name="ate" type="month" defaultValue={ate} className="w-40" />
          </Field>
          <SubmitButton variant="outline">Ver</SubmitButton>
          <a
            href="/api/exportar/encomendas"
            download
            className={cn(buttonVariants({ variant: 'ghost' }), 'text-muted-foreground')}
          >
            <Download className="h-4 w-4" />
            Excel
          </a>
        </form>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Encomendas"
          value={String(r.total.orders)}
          hint={`${r.total.units} ${r.total.units === 1 ? 'unidade' : 'unidades'}`}
        />
        <StatTile
          label="Faturação"
          value={temDados ? formatMoney(r.total.gross, currency) : '—'}
          hint={temDados ? `${formatMoney(r.total.net, currency)} sem IVA` : undefined}
        />
        <StatTile
          label="Lucro"
          value={temDados ? formatMoney(r.total.profit, currency) : '—'}
          tone={!temDados ? 'default' : r.total.profit < 0 ? 'critical' : 'good'}
          hint={
            temDados && r.total.net > 0
              ? `${formatPercent(r.total.profit / r.total.net, currency.locale)} da receita sem IVA`
              : undefined
          }
        />
        <StatTile
          label="Ticket médio"
          value={temDados ? formatMoney(r.total.averageTicket, currency) : '—'}
          hint={
            r.total.discount > 0.005
              ? `${formatMoney(r.total.discount, currency)} em descontos`
              : 'por encomenda'
          }
        />
      </div>

      {!temDados ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma encomenda entregue neste período.
        </p>
      ) : null}

      {/* ------------------------------------------------ por mes */}
      <Card>
        <CardHeader>
          <CardTitle>Faturação por mês</CardTitle>
          <CardDescription>Com IVA, como o cliente pagou. Passe por cima de uma barra para ver o valor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Barras meses={r.byMonth} currency={currency} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Encomendas</TableHead>
                <TableHead className="text-right">Faturação</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.byMonth.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="first-letter:uppercase">
                    <Link href={`/vendas?periodo=${m.month}`} className="hover:underline">
                      {mesLongo.format(dataDoMes(m.month))}
                    </Link>
                  </TableCell>
                  <TableNum>{m.orders}</TableNum>
                  <TableNum>{m.orders ? formatMoney(m.gross, currency) : '—'}</TableNum>
                  <TableNum className={m.profit < 0 ? 'text-destructive' : undefined}>
                    {m.orders ? formatMoney(m.profit, currency) : '—'}
                  </TableNum>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------ por produto */}
      {r.byProduct.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Por produto</CardTitle>
            <CardDescription>
              A nota é a dos clientes no pós-venda, de todo o histórico.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Faturação</TableHead>
                  <TableHead className="text-right">CMV</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.byProduct.map((p) => {
                  const n = notas.get(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/precificacao/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableNum>{p.units}</TableNum>
                      <TableNum>{formatMoney(p.gross, currency)}</TableNum>
                      <TableNum
                        className={
                          p.cmv > 0.4 ? 'text-destructive' : p.cmv > settings.targetCmv ? 'text-amber-700 dark:text-amber-400' : undefined
                        }
                      >
                        {formatPercent(p.cmv, currency.locale)}
                      </TableNum>
                      <TableNum>
                        {n ? `${formatRating(n.average)} (${n.count})` : '—'}
                      </TableNum>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------ melhores clientes */}
        {r.byCustomer.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Melhores clientes</CardTitle>
              <CardDescription>
                {voltaram} de {r.byCustomer.length} encomendaram mais de uma vez no período.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Encomendas</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.byCustomer.slice(0, 10).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        {c.orders > 1 ? (
                          <Badge variant="success" className="ml-2">
                            voltou
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableNum>{c.orders}</TableNum>
                      <TableNum>{formatMoney(c.gross, currency)}</TableNum>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {/* ------------------------------------------------ a esfriar */}
        <Card>
          <CardHeader>
            <CardTitle>A esfriar</CardTitle>
            <CardDescription>
              Já encomendaram, mas não há mais de {DIAS_SEM_ENCOMENDAR} dias. Os que mais
              gastaram primeiro — bons para um contacto.
            </CardDescription>
          </CardHeader>
          <CardContent className={esfriar.length > 0 ? 'p-0' : undefined}>
            {esfriar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém, por agora.</p>
            ) : (
              <Table>
                <TableBody>
                  {esfriar.map(({ c, s }) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          última a {diaFmt.format(s.lastOrder!)}
                        </span>
                      </TableCell>
                      <TableNum>{formatMoney(s.spent, currency)}</TableNum>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ origem */}
        {r.bySource.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>De onde vêm</CardTitle>
              <CardDescription>Pela forma como cada cliente nos conheceu.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Faturação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.bySource.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell>{s.source === 'NONE' ? 'Não se sabe' : SOURCE_LABEL[s.source]}</TableCell>
                      <TableNum>{s.customers}</TableNum>
                      <TableNum>{formatMoney(s.gross, currency)}</TableNum>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {/* ------------------------------------------------ quem indica */}
        <Card>
          <CardHeader>
            <CardTitle>Quem mais indica</CardTitle>
            <CardDescription>
              Clientes que trouxeram outros, e o que esses compraram no período.
            </CardDescription>
          </CardHeader>
          <CardContent className={r.byReferrer.length > 0 ? 'p-0' : undefined}>
            {r.byReferrer.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda ninguém. Ao criar um cliente que veio por indicação, escolha quem o
                indicou.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Indicou</TableHead>
                    <TableHead className="text-right">Que compraram</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.byReferrer.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/clientes/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableNum>{p.customers}</TableNum>
                      <TableNum>{formatMoney(p.gross, currency)}</TableNum>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ canal */}
        {r.byChannel.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Por canal</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Encomendas</TableHead>
                    <TableHead className="text-right">Faturação</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.byChannel.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}</TableCell>
                      <TableNum>{c.orders}</TableNum>
                      <TableNum>{formatMoney(c.gross, currency)}</TableNum>
                      <TableNum>{formatMoney(c.profit, currency)}</TableNum>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Barras da faturacao por mes. Uma serie so: cor da marca, sem legenda (o
 * titulo diz o que e), valor ao passar por cima e na tabela por baixo — nao
 * um numero em cada barra. Barras com a ponta arredondada, assentes na base.
 */
function Barras({
  meses,
  currency,
}: {
  meses: Array<{ month: string; gross: number; orders: number }>;
  currency: CurrencyConfig;
}) {
  const max = Math.max(...meses.map((m) => m.gross), 0);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {max > 0 ? `máximo ${formatMoney(max, currency)}` : 'sem faturação no período'}
      </p>
      <div
        className="flex h-40 items-end gap-[2px] border-b border-border sm:gap-2"
        role="img"
        aria-label="Faturação por mês; os valores estão na tabela abaixo"
      >
        {meses.map((m) => {
          const altura = max > 0 ? (m.gross / max) * 100 : 0;
          const rotulo = `${mesLongo.format(dataDoMes(m.month))}: ${formatMoney(m.gross, currency)} (${m.orders} encomenda${m.orders === 1 ? '' : 's'})`;
          return (
            <div
              key={m.month}
              title={rotulo}
              className="group flex h-full flex-1 cursor-default items-end justify-center"
            >
              <div
                className="w-full max-w-12 rounded-t bg-primary transition-opacity group-hover:opacity-80"
                style={{ height: `${altura}%`, minHeight: m.gross > 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] sm:gap-2">
        {meses.map((m) => (
          <span
            key={m.month}
            className="flex-1 text-center text-[11px] capitalize text-muted-foreground"
          >
            {mesCurto.format(dataDoMes(m.month)).replace('.', '')}
          </span>
        ))}
      </div>
    </div>
  );
}
