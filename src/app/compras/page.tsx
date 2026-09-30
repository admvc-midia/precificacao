import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShoppingCart } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { Paginacao } from '@/components/paginacao';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { createShoppingList } from '@/lib/actions/shopping';
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { formatMoney } from '@/lib/money';
import { pagina } from '@/lib/paginacao';
import { getCurrencyConfig } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const FECHADAS_POR_PAGINA = 10;

type ListaComItens = Awaited<ReturnType<typeof lerListas>>[number];

function lerListas(fechadas: boolean, skip = 0, take?: number) {
  return prisma.shoppingList.findMany({
    where: { closedAt: fechadas ? { not: null } : null },
    include: {
      items: { select: { status: true, packs: true, price: true } },
    },
    orderBy: fechadas ? { closedAt: 'desc' } : { createdAt: 'desc' },
    skip,
    take,
  });
}

function resumo(l: ListaComItens) {
  const total = l.items.reduce((a, i) => a + num(i.packs) * num(i.price), 0);
  const comprados = l.items.filter((i) => i.status === 'BOUGHT');
  const pago = comprados.reduce((a, i) => a + num(i.packs) * num(i.price), 0);
  return { total, pago, n: l.items.length, feitos: comprados.length };
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ pag?: string }>;
}) {
  const sp = await searchParams;
  const [currency, abertas, nFechadas] = await Promise.all([
    getCurrencyConfig(),
    lerListas(false),
    prisma.shoppingList.count({ where: { closedAt: { not: null } } }),
  ]);
  const p = pagina(nFechadas, FECHADAS_POR_PAGINA, Number(sp.pag ?? 1));
  const fechadas = await lerListas(true, p.inicio, FECHADAS_POR_PAGINA);

  const hoje = new Intl.DateTimeFormat(currency.locale, { day: '2-digit', month: '2-digit' }).format(
    new Date(),
  );
  const dataFmt = new Intl.DateTimeFormat(currency.locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Compras
          <AjudaLink secao="compras" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Listas para o supermercado, independentes da producao. Risque no telemovel,
          corrija o preco se mudou, e feche no fim para dar entrada no estoque.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Abertas</h2>
          {abertas.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma lista aberta. Crie uma ao lado.
            </p>
          ) : (
            <ul className="space-y-3">
              {abertas.map((l) => {
                const r = resumo(l);
                return (
                  <li key={l.id}>
                    <Link
                      href={`/compras/${l.id}`}
                      className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                      <ShoppingCart className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{l.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {r.feitos} de {r.n} no carrinho · previsto{' '}
                          {formatMoney(r.total, currency)}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Nova lista</CardTitle>
            <CardDescription>
              Depois de criada, junte insumos, o que esta abaixo do minimo, ou a lista de
              uma producao.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createShoppingList} showSuccess={false}>
              <Field label="Nome" htmlFor="name">
                <Input id="name" name="name" defaultValue={`Compras ${hoje}`} required />
              </Field>
              <SubmitButton className="w-full">Criar lista</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      {nFechadas > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Fechadas</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {fechadas.map((l) => {
              const r = resumo(l);
              return (
                <li key={l.id}>
                  <Link
                    href={`/compras/${l.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="hidden text-muted-foreground sm:inline">
                      {l.closedAt ? dataFmt.format(l.closedAt) : ''}
                    </span>
                    <Badge variant="secondary">{r.feitos} itens</Badge>
                    <span className="w-20 text-right tabular-nums">
                      {formatMoney(r.pago, currency)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Paginacao p={p} href={(n) => (n > 1 ? `/compras?pag=${n}` : '/compras')} />
        </section>
      ) : null}
    </div>
  );
}
