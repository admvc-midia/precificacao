import Link from 'next/link';
import { ArrowRight, ChefHat, Plus } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { ProximosEventos } from '@/components/calendario/proximos-eventos';
import { Paginacao } from '@/components/paginacao';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { produceCustomerOrders } from '@/lib/actions/encomendas';
import { num } from '@/lib/mappers';
import { formatMoney, type CurrencyConfig } from '@/lib/money';
import {
  nowInLisbon,
  relativeDay,
  STATUS_LABEL,
  STATUS_VARIANT,
} from '@/lib/pricing/encomendas';
import {
  getClosedCustomerOrdersPage,
  getCurrencyConfig,
  getOpenCustomerOrders,
} from '@/lib/queries';
import { exigirSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const FECHADAS_POR_PAGINA = 15;

type Encomenda = Awaited<ReturnType<typeof getOpenCustomerOrders>>[number];

export default async function EncomendasPage({
  searchParams,
}: {
  searchParams: Promise<{ pag?: string }>;
}) {
  const eu = await exigirSessao();
  // A cozinha ve o que ha para fazer, sem valores (ver `rotaPermitida`).
  const dono = eu.perfil === 'OWNER';
  const sp = await searchParams;
  const [currency, abertas, fechadas] = await Promise.all([
    getCurrencyConfig(),
    getOpenCustomerOrders(),
    getClosedCustomerOrdersPage(Number(sp.pag ?? 1), FECHADAS_POR_PAGINA),
  ]);

  const agora = nowInLisbon();
  const podeProduzir = abertas.some((e) => e.status === 'REQUESTED' && !e.productionOrderId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Encomendas
            <AjudaLink secao="encomendas" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O que os clientes pediram e para quando. Conta como venda quando é entregue.
          </p>
        </div>
        {dono ? (
          <Link href="/encomendas/nova" className={cn(buttonVariants(), 'w-full sm:w-auto')}>
            <Plus className="h-4 w-4" />
            Nova encomenda
          </Link>
        ) : null}
      </header>

      <ProximosEventos />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Por entregar</h2>
        {abertas.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma encomenda por entregar.
          </p>
        ) : (
          <ActionForm action={produceCustomerOrders}>
            <ul className="space-y-2">
              {abertas.map((e) => (
                <li key={e.id}>
                  <Cartao encomenda={e} currency={currency} agora={agora} escolher dono={dono} />
                </li>
              ))}
            </ul>
            {podeProduzir ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Marque as encomendas pedidas e mande-as juntas para produção: os produtos
                  somam-se numa ordem, com a lista de compras.
                </p>
                <SubmitButton variant="secondary" className="shrink-0" pendingLabel="A criar…">
                  <ChefHat className="h-4 w-4" />
                  Produzir as marcadas
                </SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        )}
      </section>

      {fechadas.total > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Entregues e canceladas</h2>
          <ul className="space-y-2">
            {fechadas.rows.map((e) => (
              <li key={e.id}>
                <Cartao encomenda={e} currency={currency} agora={agora} dono={dono} />
              </li>
            ))}
          </ul>
          <Paginacao
            p={fechadas.p}
            href={(n) => (n > 1 ? `/encomendas?pag=${n}` : '/encomendas')}
          />
        </section>
      ) : null}
    </div>
  );
}

const dataFmt = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function Cartao({
  encomenda: e,
  currency,
  agora,
  escolher = false,
  dono,
}: {
  /** Sem isto, nada de valores: e a vista da cozinha. */
  dono: boolean;
  encomenda: Encomenda;
  currency: CurrencyConfig;
  agora: Date;
  /** Mostra a caixa para mandar para producao, quando ainda pode ir. */
  escolher?: boolean;
}) {
  const total = e.lines.reduce((a, l) => a + num(l.qty) * num(l.unitPrice), 0);
  const resumo =
    e.lines.length === 0
      ? 'Sem produtos'
      : e.lines
          .slice(0, 3)
          .map((l) => `${num(l.qty)}× ${l.recipe.name}`)
          .join(', ') + (e.lines.length > 3 ? '…' : '');
  const aberta = e.status !== 'DELIVERED' && e.status !== 'CANCELLED';
  const atrasada = aberta && e.dueAt < agora;
  const dia = relativeDay(e.dueAt, agora);
  const marcavel = escolher && e.status === 'REQUESTED' && !e.productionOrderId;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50',
        e.status === 'CANCELLED' && 'opacity-60',
      )}
    >
      {escolher ? (
        <span className="flex w-6 shrink-0 justify-center">
          {marcavel ? (
            <input
              type="checkbox"
              name="ids"
              value={e.id}
              aria-label={`Produzir a encomenda ${e.number}`}
              className="h-5 w-5 rounded border-input"
            />
          ) : null}
        </span>
      ) : null}

      <Link href={`/encomendas/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              #{e.number} · {e.customer?.name ?? 'Sem cliente'}
            </span>
            <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
            {dono && e.paid ? <Badge variant="success">pago</Badge> : null}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="capitalize">{dataFmt.format(e.dueAt)}</span>
            {atrasada ? (
              <Badge variant="destructive">atrasada</Badge>
            ) : aberta && dia ? (
              <Badge variant="warning">{dia}</Badge>
            ) : null}
            {e.fulfillment === 'DELIVERY' ? <span>· entregar</span> : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{resumo}</span>
        </span>
        {dono ? (
          <span className="shrink-0 text-right font-medium tabular-nums">
            {formatMoney(total, currency)}
          </span>
        ) : null}
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}
