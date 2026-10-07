/**
 * Uma diferenca, como se le: o que ficou igual em cinzento, o que saiu riscado
 * a vermelho com "−", o que entrou a verde com "+". Numa linha que mudou, so
 * as palavras alteradas levam cor — "200 g" riscado ao lado de "150 g".
 *
 * A cor nunca vai sozinha: ha sempre o sinal (+ / − / ~) e o risco, para quem
 * nao distingue vermelho de verde e para a impressao a preto e branco.
 */

import type { LinhaDiff } from '@/lib/livro/diff';
import { cn } from '@/lib/utils';

const SAIU = 'bg-red-100 text-red-900 line-through decoration-red-700/60 dark:bg-red-950/60 dark:text-red-200';
const ENTROU = 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200';

function Sinal({ s, rotulo }: { s: string; rotulo: string }) {
  return (
    <span aria-label={rotulo} className="w-4 shrink-0 select-none text-center font-mono text-muted-foreground">
      {s}
    </span>
  );
}

export function DiffView({ linhas, vazio }: { linhas: LinhaDiff[]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {linhas.map((l, i) => {
        if (l.tipo === 'igual') {
          return (
            <li key={i} className="flex gap-2 px-2 py-1 text-muted-foreground">
              <Sinal s=" " rotulo="igual" />
              <span>{l.depois}</span>
            </li>
          );
        }
        if (l.tipo === 'saiu') {
          return (
            <li key={i} className={cn('flex gap-2 rounded px-2 py-1', SAIU)}>
              <Sinal s="−" rotulo="saiu" />
              <span>{l.antes}</span>
            </li>
          );
        }
        if (l.tipo === 'entrou') {
          return (
            <li key={i} className={cn('flex gap-2 rounded px-2 py-1', ENTROU)}>
              <Sinal s="+" rotulo="entrou" />
              <span>{l.depois}</span>
            </li>
          );
        }
        return (
          <li key={i} className="flex gap-2 rounded border border-amber-300/60 px-2 py-1 dark:border-amber-800/60">
            <Sinal s="~" rotulo="mudou" />
            <span>
              {l.palavras!.map((p, k) =>
                p.tipo === 'igual' ? (
                  <span key={k}>{p.texto}</span>
                ) : p.tipo === 'saiu' ? (
                  <del key={k} className={cn('rounded px-0.5', SAIU)}>
                    {p.texto}
                  </del>
                ) : (
                  <ins key={k} className={cn('rounded px-0.5 no-underline', ENTROU)}>
                    {p.texto}
                  </ins>
                ),
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Um campo curto (rendimento, tempo): antes → depois, ou "igual". */
export function CampoDiff({ rotulo, antes, depois }: { rotulo: string; antes: string | null; depois: string | null }) {
  const a = antes ?? '';
  const d = depois ?? '';
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{rotulo}: </span>
      {a === d ? (
        <span>{a || '—'} <span className="text-xs text-muted-foreground">(igual)</span></span>
      ) : (
        <>
          <del className={cn('rounded px-1', SAIU)}>{a || 'vazio'}</del> →{' '}
          <ins className={cn('rounded px-1 no-underline', ENTROU)}>{d || 'vazio'}</ins>
        </>
      )}
    </p>
  );
}
