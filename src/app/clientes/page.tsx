import Link from 'next/link';
import { Cake, Plus } from 'lucide-react';

import { FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposContacto } from '@/components/clientes/campos-cliente';
import { DataList, type ListColumn, type ListRow } from '@/components/data-list';
import { StatTile } from '@/components/dre-breakdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createCustomer } from '@/lib/actions/clientes';
import { num, toGlobalSettings } from '@/lib/mappers';
import { currencyOf, formatMoney } from '@/lib/money';
import {
  customerStats,
  DIAS_ANTES_ANIVERSARIO,
  DIAS_SEM_ENCOMENDAR,
  daysUntilBirthday,
  formatRating,
  SOURCE_LABEL,
} from '@/lib/pricing/clientes';
import { daysBetween, grossOf, nowInLisbon } from '@/lib/pricing/encomendas';
import { getCustomersWithOrders, getSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const COLUMNS: ListColumn[] = [
  { header: 'Cliente' },
  { header: 'Encomendas', align: 'right' },
  { header: 'Gasto', align: 'right' },
  { header: 'Última', align: 'right', hideBelow: 'lg' },
  { header: 'Nota', align: 'right', hideBelow: 'lg' },
];

const diaFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' });

export default async function ClientesPage() {
  const [clientes, settingsRow] = await Promise.all([getCustomersWithOrders(), getSettings()]);
  const settings = toGlobalSettings(settingsRow);
  const currency = currencyOf(settingsRow);
  const hoje = nowInLisbon();

  const comNumeros = clientes.map((c) => ({
    c,
    s: customerStats(
      c.orders.map((o) => ({
        status: o.status,
        dueAt: o.dueAt,
        deliveredAt: o.deliveredAt,
        rating: o.rating,
        gross: grossOf(
          o.lines.reduce((a, l) => a + num(l.qty) * num(l.unitPrice), 0),
          settings,
        ),
      })),
    ),
  }));

  // Quem encomendou ha mais tempo primeiro? Nao: quem encomendou por ultimo,
  // que e quem se procura; os que nunca receberam nada vao para o fim.
  comNumeros.sort(
    (a, b) => (b.s.lastOrder?.getTime() ?? 0) - (a.s.lastOrder?.getTime() ?? 0),
  );

  const ativos = comNumeros.filter((x) => x.s.orders > 0);
  const voltaram = ativos.filter((x) => x.s.orders > 1).length;
  const aEsfriar = ativos.filter(
    (x) => x.s.lastOrder && daysBetween(x.s.lastOrder, hoje) > DIAS_SEM_ENCOMENDAR,
  ).length;

  const rows: ListRow[] = comNumeros.map(({ c, s }) => {
    const esfriar = s.lastOrder !== null && daysBetween(s.lastOrder, hoje) > DIAS_SEM_ENCOMENDAR;
    const faltam =
      c.birthDay && c.birthMonth ? daysUntilBirthday(c.birthDay, c.birthMonth, hoje) : null;
    const aniversario = faltam !== null && faltam <= DIAS_ANTES_ANIVERSARIO;

    const nome = (
      <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
        {c.name}
      </Link>
    );
    const selos = (
      <>
        {aniversario ? (
          <Badge variant="warning">
            <Cake className="mr-1 h-3 w-3" aria-hidden />
            {faltam === 0 ? 'faz anos hoje' : `anos em ${faltam} d`}
          </Badge>
        ) : null}
        {esfriar ? <Badge variant="outline">sem encomendar há {daysBetween(s.lastOrder!, hoje)} d</Badge> : null}
        {s.orders > 1 ? <Badge variant="success">voltou {s.orders - 1}×</Badge> : null}
      </>
    );
    const origem = [
      c.source ? SOURCE_LABEL[c.source] : null,
      c.referredBy ? `indicado por ${c.referredBy.name}` : null,
      c._count.referrals > 0 ? `indicou ${c._count.referrals}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      id: c.id,
      // As redes com e sem @: procura-se "ana.doces" ou "@ana.doces".
      search: `${c.name} ${c.phone ?? ''} ${c.likes ?? ''} ${origem} ${[c.instagram, c.facebook, c.tiktok]
        .filter(Boolean)
        .map((r) => `${r} @${r}`)
        .join(' ')}`,
      cells: [
        <div key="n" className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {nome}
            {selos}
          </div>
          <div className="text-xs text-muted-foreground">
            {[c.phone, c.instagram ? `@${c.instagram}` : null, origem].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>,
        <span key="e" className="tabular-nums">
          {s.orders}
        </span>,
        <span key="g" className="font-medium tabular-nums">
          {s.orders > 0 ? formatMoney(s.spent, currency) : '—'}
        </span>,
        <span key="u" className="whitespace-nowrap text-muted-foreground">
          {s.lastOrder ? diaFmt.format(s.lastOrder) : '—'}
        </span>,
        <span key="r" className="whitespace-nowrap">
          {formatRating(s.averageRating)}
        </span>,
      ],
      title: (
        <span className="flex flex-wrap items-center gap-2">
          {nome}
          {selos}
        </span>
      ),
      lead: (
        <span className="font-medium tabular-nums">
          {s.orders > 0 ? formatMoney(s.spent, currency) : '—'}
        </span>
      ),
      meta: (
        <>
          {s.orders} encomenda{s.orders === 1 ? '' : 's'}
          {s.averageRating !== null ? ` · ${formatRating(s.averageRating)}` : ''}
          {c.phone ? ` · ${c.phone}` : ''}
        </>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Clientes
          <AjudaLink secao="clientes" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Quem encomenda, quanto, do que gosta e quem trouxe quem.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Clientes" value={String(clientes.length)} hint={`${ativos.length} já receberam encomendas`} />
        <StatTile
          label="Voltaram"
          value={String(voltaram)}
          tone={voltaram > 0 ? 'good' : 'default'}
          hint={
            ativos.length > 0
              ? `${Math.round((voltaram / ativos.length) * 100)}% encomendaram mais de uma vez`
              : 'encomendaram mais de uma vez'
          }
        />
        <StatTile
          label="A esfriar"
          value={String(aEsfriar)}
          tone={aEsfriar > 0 ? 'warning' : 'default'}
          hint={`sem encomendar há mais de ${DIAS_SEM_ENCOMENDAR} dias`}
        />
        <StatTile
          label="Aceitam contacto"
          value={String(clientes.filter((c) => c.contactConsentAt).length)}
          hint="podem receber o pós-venda"
        />
      </div>

      <DataList
        columns={COLUMNS}
        rows={rows}
        searchPlaceholder="Procurar por nome, telefone ou gosto…"
        empty="Ainda não há clientes. Aparecem aqui ao criar uma encomenda, ou crie um já."
        toolbar={
          <FormDialog
            action={createCustomer}
            title="Novo cliente"
            submitLabel="Criar cliente"
            className="max-h-[90vh] overflow-y-auto"
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo cliente
              </Button>
            }
          >
            <CamposContacto outros={clientes.map((c) => ({ id: c.id, name: c.name }))} prefixo="novo" />
          </FormDialog>
        }
      />
    </div>
  );
}
