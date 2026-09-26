import Link from 'next/link';
import { ArrowRight, CalendarDays, Trash2 } from 'lucide-react';

import { ActionForm, DeleteButton, SubmitButton } from '@/components/action-form';
import { Alert, Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { createOrder, deleteOrder } from '@/lib/actions/production';
import { getCostedRecipes, getProductionOrders } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ProducaoPage() {
  const [orders, { recipes, currency }] = await Promise.all([
    getProductionOrders(),
    getCostedRecipes(),
  ]);

  const products = recipes.filter((r) => r.kind === 'PRODUCT');

  const dateFmt = new Intl.DateTimeFormat(currency.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Producao e compras</h1>
        <p className="text-sm text-muted-foreground">
          Diga quanto quer produzir; a aplicacao desce pelas fichas tecnicas e
          responde o que falta comprar, em que loja e por quanto.
        </p>
      </header>

      {products.length === 0 ? (
        <Alert tone="info">
          Nao ha produtos finais cadastrados.{' '}
          <Link href="/fichas" className="underline">
            Crie uma ficha tecnica
          </Link>{' '}
          antes de planear uma producao.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Ordens de producao</CardTitle>
            <Badge variant="secondary">{orders.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma ordem ainda. Crie a primeira ao lado — por exemplo, a
                producao do proximo fim de semana.
              </p>
            ) : (
              orders.map((order) => {
                const totalPortions = order.lines.reduce(
                  (acc, l) => acc + Number(l.qty),
                  0,
                );
                return (
                  <div
                    key={order.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/producao/${order.id}`}
                          className="font-medium hover:underline"
                        >
                          {order.name}
                        </Link>
                        {order.dueAt ? (
                          <Badge variant="secondary">
                            <CalendarDays className="mr-1 h-3 w-3" aria-hidden />
                            {dateFmt.format(order.dueAt)}
                          </Badge>
                        ) : null}
                        {order._count.listLines > 0 ? (
                          <Badge variant="success">lista guardada</Badge>
                        ) : null}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {order.lines.length === 0
                          ? 'Sem produtos'
                          : `${totalPortions} porcoes · ${order.lines
                              .slice(0, 3)
                              .map((l) => `${Number(l.qty)}x ${l.recipe.name}`)
                              .join(', ')}${order.lines.length > 3 ? '…' : ''}`}
                      </p>
                      {order.notes ? (
                        <p className="text-xs text-muted-foreground">{order.notes}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/producao/${order.id}`}
                        className="inline-flex items-center gap-1 px-2 text-sm text-primary hover:underline"
                      >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <ActionForm action={deleteOrder} showSuccess={false}>
                        <input type="hidden" name="id" value={order.id} />
                        <DeleteButton
                          confirmMessage={`Remover a ordem "${order.name}"?`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </DeleteButton>
                      </ActionForm>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Nova ordem</CardTitle>
            <CardDescription>
              Um plano de producao: o que fazer e para quando.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createOrder}>
              <Field label="Nome" htmlFor="ord-name">
                <Input
                  id="ord-name"
                  name="name"
                  placeholder="Fim de semana 3-4 out"
                  required
                />
              </Field>
              <Field label="Data da producao" htmlFor="ord-due">
                <Input id="ord-due" name="dueAt" type="date" />
              </Field>
              <Field label="Notas" htmlFor="ord-notes">
                <Textarea
                  id="ord-notes"
                  name="notes"
                  placeholder="Festa da rua. Comprar na quinta."
                />
              </Field>
              <SubmitButton>Criar ordem</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
