/**
 * Faixa com o que vem nos proximos dias: feriados, datas que vendem e os
 * eventos do dono, com o plano de producao de cada um. Aparece onde se
 * trabalha (Encomendas, Producao), para ninguem ter de abrir o calendario
 * para saber que a 12/10 nao se faz bolo de pote.
 */

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

import { eventosDoIntervalo } from '@/lib/calendario/consultas';
import { somarDias } from '@/lib/calendario/datas';
import { ACAO_LABEL } from '@/lib/calendario/eventos';
import { diaEmLisboa } from '@/lib/datas';

const DIAS = 10;
const quando = new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });

export async function ProximosEventos() {
  const hoje = diaEmLisboa(new Date());
  let eventos;
  try {
    eventos = await eventosDoIntervalo(hoje, somarDias(hoje, DIAS - 1));
  } catch (err) {
    // A faixa e ajuda, nao o trabalho: se falhar, a pagina abre sem ela.
    console.warn('[calendario] faixa sem eventos', err);
    return null;
  }
  if (eventos.length === 0) return null;

  return (
    <aside className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          Próximos {DIAS} dias
        </p>
        <Link href={`/calendario?mes=${hoje.slice(0, 7)}`} className="text-xs text-primary hover:underline">
          Ver calendário
        </Link>
      </div>
      <ul className="space-y-1">
        {eventos.slice(0, 6).map((o) => (
          <li key={o.chaveUnica}>
            <span className="tabular-nums text-muted-foreground">{quando.format(new Date(`${o.dia}T00:00:00Z`))}</span>{' '}
            <span className="font-medium">{o.titulo}</span>
            {o.feriado ? <span className="text-red-700 dark:text-red-400"> · feriado</span> : null}
            {o.planos.length > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                — {o.planos.map((p) => `${ACAO_LABEL[p.acao].toLowerCase()}: ${p.produto}${p.qty ? ` (${p.qty})` : ''}`).join('; ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
