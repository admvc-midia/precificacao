/**
 * Lembretes: a linha de cada um (com o circulo de feito) e a janela de criar.
 * Servem a pagina de Pos-venda e a ficha do cliente.
 */

import Link from 'next/link';
import { Check, Plus } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { createReminder, deleteReminder, toggleReminder } from '@/lib/actions/posvenda';
import { daysBetween } from '@/lib/pricing/encomendas';
import { cn } from '@/lib/utils';

export interface LembreteLinha {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date;
  doneAt: Date | null;
  customer?: { id: string; name: string } | null;
  order?: { id: string; number: number } | null;
}

const diaFmt = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** "hoje", "amanha", "atrasado 3 d" — ou nada, para os mais longe. */
function quando(dueAt: Date, hoje: Date) {
  const d = daysBetween(hoje, dueAt);
  if (d < 0) return <Badge variant="destructive">atrasado {-d} d</Badge>;
  if (d === 0) return <Badge variant="warning">hoje</Badge>;
  if (d === 1) return <Badge variant="secondary">amanhã</Badge>;
  return null;
}

export function Lembrete({
  r,
  hoje,
  mostrarCliente = true,
}: {
  r: LembreteLinha;
  /** Hoje, no relogio de Lisboa (ver `nowInLisbon`). */
  hoje: Date;
  mostrarCliente?: boolean;
}) {
  const feito = r.doneAt !== null;
  return (
    <li className="flex items-start gap-3 rounded-md border bg-card p-3 text-sm">
      <ActionForm action={toggleReminder} showSuccess={false} className="space-y-0">
        <input type="hidden" name="id" value={r.id} />
        <button
          type="submit"
          title={feito ? 'Voltar a por fazer' : 'Marcar como feito'}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            feito
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 hover:border-primary',
          )}
        >
          {feito ? <Check className="h-3 w-3" /> : null}
          <span className="sr-only">{feito ? 'Voltar a por fazer' : 'Feito'}</span>
        </button>
      </ActionForm>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', feito && 'text-muted-foreground line-through')}>
            {r.title}
          </span>
          {!feito ? quando(r.dueAt, hoje) : null}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className="capitalize">{diaFmt.format(r.dueAt)}</span>
          {mostrarCliente && r.customer ? (
            <Link href={`/clientes/${r.customer.id}`} className="text-primary hover:underline">
              {r.customer.name}
            </Link>
          ) : null}
          {r.order ? (
            <Link href={`/encomendas/${r.order.id}`} className="text-primary hover:underline">
              encomenda #{r.order.number}
            </Link>
          ) : null}
        </div>
        {r.notes ? <p className="whitespace-pre-line text-xs">{r.notes}</p> : null}
      </div>

      <ConfirmDelete
        action={deleteReminder}
        fields={{ id: r.id }}
        title="Apagar o lembrete?"
        description={r.title}
        confirmLabel="Apagar"
      />
    </li>
  );
}

/** Janela de novo lembrete, opcionalmente ja ligado a um cliente ou encomenda. */
export function NovoLembrete({
  customerId,
  orderId,
  hojeIso,
  rotulo = 'Lembrete',
}: {
  customerId?: string;
  orderId?: string;
  /** "2026-10-07", para o dia vir preenchido. */
  hojeIso: string;
  rotulo?: string;
}) {
  return (
    <FormDialog
      action={createReminder}
      title="Novo lembrete"
      submitLabel="Criar lembrete"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          {rotulo}
        </Button>
      }
    >
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      <Field label="O que fazer" htmlFor="lem-titulo">
        <Input id="lem-titulo" name="title" placeholder="Ligar sobre o bolo de casamento" required />
      </Field>
      <Field label="Dia" htmlFor="lem-dia">
        <Input id="lem-dia" name="dueAt" type="date" defaultValue={hojeIso} required />
      </Field>
      <Field label="Notas" htmlFor="lem-notas">
        <Textarea id="lem-notas" name="notes" rows={2} />
      </Field>
    </FormDialog>
  );
}
