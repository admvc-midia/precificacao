import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Bell,
  Cake,
  Heart,
  MessageCircle,
  Phone,
  Plus,
  User,
} from 'lucide-react';

import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CartaoInfo } from '@/components/cartao-info';
import { CamposContacto, CamposGostos } from '@/components/clientes/campos-cliente';
import { RedesCliente } from '@/components/clientes/redes-cliente';
import { StatTile } from '@/components/dre-breakdown';
import { Lembrete, NovoLembrete } from '@/components/posvenda/lembretes';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteCustomer, updateCustomer } from '@/lib/actions/clientes';
import { num, toGlobalSettings } from '@/lib/mappers';
import { currencyOf, formatMoney } from '@/lib/money';
import {
  customerStats,
  daysUntilBirthday,
  formatRating,
  linkWhatsApp,
  SOURCE_LABEL,
} from '@/lib/pricing/clientes';
import {
  grossOf,
  nowInLisbon,
  STATUS_LABEL,
  STATUS_VARIANT,
  toLocalInput,
} from '@/lib/pricing/encomendas';
import { getCustomerDetail, getCustomers, getSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const diaFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'UTC' });
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, todos, settingsRow] = await Promise.all([
    getCustomerDetail(id),
    getCustomers(),
    getSettings(),
  ]);
  if (!c) notFound();

  const settings = toGlobalSettings(settingsRow);
  const currency = currencyOf(settingsRow);
  const hoje = nowInLisbon();
  const hojeIso = toLocalInput(hoje).slice(0, 10);

  const encomendas = c.orders.map((o) => ({
    ...o,
    gross: grossOf(o.lines.reduce((a, l) => a + num(l.qty) * num(l.unitPrice), 0), settings),
  }));
  const s = customerStats(encomendas);
  const faltam =
    c.birthDay && c.birthMonth ? daysUntilBirthday(c.birthDay, c.birthMonth, hoje) : null;
  const outros = todos.map((o) => ({ id: o.id, name: o.name }));
  const abertos = c.reminders.filter((r) => !r.doneAt);
  const feitos = c.reminders.filter((r) => r.doneAt);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/clientes" className="text-sm text-muted-foreground hover:underline">
              Clientes
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {c.name}
              <AjudaLink secao="clientes" />
            </h1>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {c.contactConsentAt ? (
              <Badge variant="success">aceita contacto</Badge>
            ) : (
              <Badge variant="outline">sem autorização de contacto</Badge>
            )}
            {faltam !== null && faltam <= 7 ? (
              <Badge variant="warning">
                <Cake className="mr-1 h-3 w-3" aria-hidden />
                {faltam === 0 ? 'faz anos hoje' : `faz anos em ${faltam} dias`}
              </Badge>
            ) : null}
          </p>
        </div>
        <Link
          href={`/encomendas/nova?cliente=${c.id}`}
          className={cn(buttonVariants(), 'w-full sm:w-auto')}
        >
          <Plus className="h-4 w-4" />
          Nova encomenda
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Encomendas"
          value={String(s.orders)}
          hint={s.lastOrder ? `última a ${diaFmt.format(s.lastOrder)}` : 'nenhuma entregue ainda'}
        />
        <StatTile label="Total gasto" value={s.orders ? formatMoney(s.spent, currency) : '—'} />
        <StatTile
          label="Ticket médio"
          value={s.orders ? formatMoney(s.averageTicket, currency) : '—'}
        />
        <StatTile
          label="Nota média"
          value={formatRating(s.averageRating)}
          tone={s.averageRating === null ? 'default' : s.averageRating >= 4 ? 'good' : s.averageRating >= 3 ? 'warning' : 'critical'}
          hint={s.ratings > 0 ? `${s.ratings} opinião(ões)` : 'ainda sem opinião'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CartaoInfo
          icon={User}
          titulo="Contacto"
          editar={
            <FormDialog
              action={updateCustomer}
              title="Dados do cliente"
              className="max-h-[90vh] overflow-y-auto"
            >
              <input type="hidden" name="id" value={c.id} />
              <CamposContacto cliente={c} outros={outros} prefixo="ed" />
            </FormDialog>
          }
        >
          {c.phone ? (
            <div className="flex flex-wrap gap-1.5">
              <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
                <a href={`tel:${c.phone.replace(/\s/g, '')}`}>
                  <Phone className="h-3.5 w-3.5" />
                  {c.phone}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
                <a href={linkWhatsApp(c.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Sem telefone</p>
          )}
          <RedesCliente cliente={c} className="gap-1.5" />
          <Dado rotulo="Aniversário">
            {c.birthDay && c.birthMonth ? `${c.birthDay} de ${MESES[c.birthMonth - 1]}` : '—'}
          </Dado>
          <Dado rotulo="Conheceu-nos">{c.source ? SOURCE_LABEL[c.source] : '—'}</Dado>
          {c.referredBy ? (
            <Dado rotulo="Indicado por">
              <Link href={`/clientes/${c.referredBy.id}`} className="text-primary hover:underline">
                {c.referredBy.name}
              </Link>
            </Dado>
          ) : null}
          {c.referrals.length > 0 ? (
            <Dado rotulo={`Indicou ${c.referrals.length}`}>
              {c.referrals.map((r, i) => (
                <span key={r.id}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/clientes/${r.id}`} className="text-primary hover:underline">
                    {r.name}
                  </Link>
                </span>
              ))}
            </Dado>
          ) : null}
        </CartaoInfo>

        <CartaoInfo
          icon={Heart}
          titulo="Gostos"
          editar={
            <FormDialog action={updateCustomer} title={`Gostos de ${c.name}`}>
              <input type="hidden" name="id" value={c.id} />
              <CamposGostos cliente={c} prefixo="gostos" />
            </FormDialog>
          }
        >
          {c.likes || c.dislikes || c.notes ? (
            <>
              {c.likes ? <Dado rotulo="Gosta">{c.likes}</Dado> : null}
              {c.dislikes ? <Dado rotulo="Não gosta">{c.dislikes}</Dado> : null}
              {c.notes ? (
                <p className="whitespace-pre-line rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                  {c.notes}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">
              Ainda nada. Do que gosta, do que não gosta, para quem costuma encomendar.
            </p>
          )}
        </CartaoInfo>

        <CartaoInfo
          icon={Bell}
          titulo="Lembretes"
          editar={<NovoLembrete customerId={c.id} hojeIso={hojeIso} rotulo="Novo" />}
        >
          {abertos.length === 0 && feitos.length === 0 ? (
            <p className="text-muted-foreground">Nenhum lembrete.</p>
          ) : (
            <ul className="space-y-2">
              {[...abertos, ...feitos.slice(0, 3)].map((r) => (
                <Lembrete key={r.id} r={r} hoje={hoje} mostrarCliente={false} />
              ))}
            </ul>
          )}
        </CartaoInfo>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Encomendas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {encomendas.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Ainda não encomendou.</p>
          ) : (
            <ul className="divide-y">
              {encomendas.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/encomendas/${o.id}`}
                    className="flex items-start gap-3 px-6 py-3 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">#{o.number}</span>
                        <span className="text-muted-foreground">{diaFmt.format(o.dueAt)}</span>
                        <Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        {o.rating !== null ? <Badge variant="secondary">{o.rating} ★</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.lines.map((l) => `${num(l.qty)}× ${l.recipe.name}`).join(', ')}
                      </span>
                      {o.feedbackComment ? (
                        <span className="block text-xs italic">“{o.feedbackComment}”</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMoney(o.gross, currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDelete
        action={deleteCustomer}
        fields={{ id: c.id }}
        title={`Apagar ${c.name}?`}
        description="Os dados do cliente apagam-se de vez (é o direito ao apagamento do RGPD). As encomendas ficam, sem nome, porque são vendas da casa."
        confirmLabel="Apagar cliente"
        trigger={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            Apagar cliente
          </Button>
        }
      />
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="text-muted-foreground">{rotulo}: </span>
      {children}
    </p>
  );
}
