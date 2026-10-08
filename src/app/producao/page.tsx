import Link from 'next/link';
import { ArrowRight, CalendarDays, Plus } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { ProximosEventos } from '@/components/calendario/proximos-eventos';
import { DataList, type ListColumn, type ListRow } from '@/components/data-list';
import { Alert, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { createOrder, deleteOrder } from '@/lib/actions/production';
import { getCostedRecipes, getProductionOrders } from '@/lib/queries';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const COLUMNS: ListColumn[] = [
  { header: 'Ordem' },
  { header: 'Data', hideBelow: 'lg' },
  { header: 'Porcoes', align: 'right' },
];

export default async function ProducaoPage() {
  const eu = await exigirSessao();
  // A cozinha ve as ordens e entra nelas; criar e apagar e com o dono.
  const dono = eu.perfil === 'OWNER';
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

  const rows: ListRow[] = orders.map((order) => {
    const porcoes = order.lines.reduce((acc, l) => acc + Number(l.qty), 0);
    const data = order.dueAt ? dateFmt.format(order.dueAt) : '—';

    const resumo =
      order.lines.length === 0
        ? 'Sem produtos'
        : order.lines
            .slice(0, 3)
            .map((l) => `${Number(l.qty)}x ${l.recipe.name}`)
            .join(', ') + (order.lines.length > 3 ? '…' : '');

    const nome = (
      <Link href={`/producao/${order.id}`} className="font-medium hover:underline">
        {order.name}
      </Link>
    );

    return {
      id: order.id,
      search: `${order.name} ${order.notes ?? ''} ${order.lines
        .map((l) => l.recipe.name)
        .join(' ')}`,
      cells: [
        <div key="n">
          <div className="flex flex-wrap items-center gap-2">
            {nome}
            {order.promotional ? <Badge variant="warning">para oferecer</Badge> : null}
            {order._count.listLines > 0 ? (
              <Badge variant="success">lista guardada</Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{resumo}</div>
        </div>,
        <span key="d" className="whitespace-nowrap text-muted-foreground">
          {order.dueAt ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {data}
            </span>
          ) : (
            '—'
          )}
        </span>,
        <span key="p" className="font-medium">
          {porcoes}
        </span>,
      ],
      title: (
        <span className="flex flex-wrap items-center gap-2">
          {nome}
          {order._count.listLines > 0 ? (
            <Badge variant="success">guardada</Badge>
          ) : null}
        </span>
      ),
      lead: <span className="font-medium">{porcoes} porcoes</span>,
      meta: (
        <>
          {order.dueAt ? `${data} · ` : ''}
          {resumo}
        </>
      ),
      actions: (
        <>
          <Link
            href={`/producao/${order.id}`}
            className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-1.5 text-sm text-primary hover:underline"
          >
            Abrir
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {dono ? (
          <ConfirmDelete
            action={deleteOrder}
            fields={{ id: order.id }}
            title={`Remover a ordem "${order.name}"?`}
            description="A ordem e a lista de compras guardada sao apagadas. Os insumos e fichas nao sao afetados."
          />
          ) : null}
        </>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Producao e compras
            <AjudaLink secao="producao" />
          </h1>
        <p className="text-sm text-muted-foreground">
          Diga quanto quer produzir; a aplicacao desce pelas fichas tecnicas e
          responde o que falta comprar, em que loja e por quanto.
        </p>
      </header>

      <ProximosEventos />

      {products.length === 0 ? (
        <Alert tone="info">
          Nao ha produtos finais cadastrados.{' '}
          <Link href="/fichas" className="underline">
            Crie uma ficha tecnica
          </Link>{' '}
          antes de planear uma producao.
        </Alert>
      ) : null}

      <DataList
        columns={COLUMNS}
        rows={rows}
        searchPlaceholder="Procurar ordem…"
        empty="Nenhuma ordem ainda. Crie a primeira — por exemplo, a producao do proximo fim de semana."
        toolbar={dono ? <NovaOrdem /> : undefined}
      />
    </div>
  );
}

function NovaOrdem() {
  return (
    <FormDialog
      action={createOrder}
      title="Nova ordem de producao"
      description="Um plano de producao: o que fazer e para quando."
      submitLabel="Criar ordem"
      trigger={
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Nova ordem
        </Button>
      }
    >
      <Field label="Nome" htmlFor="ord-name">
        <Input id="ord-name" name="name" placeholder="Fim de semana 3-4 out" required />
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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="promotional"
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          E para oferecer
          <span className="block text-xs text-muted-foreground">
            Amostras, evento, caixa de correio. Sai do estoque na mesma, mas
            entra como custo de divulgacao e nao no CMV — senao uma campanha de
            amostras faria o CMV disparar sem haver problema nenhum.
          </span>
        </span>
      </label>
    </FormDialog>
  );
}
