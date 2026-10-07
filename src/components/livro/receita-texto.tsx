/**
 * O conteudo de uma versao, como se le na cozinha e no papel: ingredientes
 * em lista (com as partes — «Massa:», «Recheio:» — como subtitulos) e o
 * preparo em passos numerados.
 */

import { linhas, passos } from '@/lib/livro/receita';
import { cn } from '@/lib/utils';

/** Uma linha que acaba em dois pontos e curta e o nome de uma parte da receita. */
function eParte(l: string): boolean {
  return l.endsWith(':') && l.length <= 40;
}

export function Ingredientes({ texto, className }: { texto: string; className?: string }) {
  return (
    <ul className={cn('space-y-1', className)}>
      {linhas(texto).map((l, i) =>
        eParte(l) ? (
          <li key={i} className="pt-2 font-semibold first:pt-0">
            {l.slice(0, -1)}
          </li>
        ) : (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-primary">
              •
            </span>
            <span>{l}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Cada passo com o seu numero; as partes («Recheio:») nao contam. */
function numerar(lista: string[]): Array<{ texto: string; n: number | null }> {
  const out: Array<{ texto: string; n: number | null }> = [];
  let n = 0;
  for (const p of lista) {
    if (eParte(p)) out.push({ texto: p, n: null });
    else out.push({ texto: p, n: ++n });
  }
  return out;
}

export function Passos({ texto, className }: { texto: string; className?: string }) {
  return (
    <ol className={cn('space-y-3', className)}>
      {numerar(passos(texto)).map(({ texto: p, n }, i) => {
        if (n === null) {
          return (
            <li key={i} className="pt-1 font-semibold">
              {p.slice(0, -1)}
            </li>
          );
        }
        return (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {n}
            </span>
            <span className="pt-0.5">{p}</span>
          </li>
        );
      })}
    </ol>
  );
}
