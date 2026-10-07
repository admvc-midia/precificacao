/**
 * Os botoes "‹ 1 2 3 ›" e o "1–20 de 57".
 *
 * Sem `'use client'` de proposito: do servidor recebe `href` e desenha links
 * (o Estoque pagina na base); dentro de um componente de cliente recebe
 * `onChange` e desenha botoes (as listas que ja tem as linhas todas).
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { botoes, type Pagina } from '@/lib/paginacao';
import { cn } from '@/lib/utils';

const base =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';
const normal = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';
const ativa = 'bg-primary text-primary-foreground';
const desligada = 'pointer-events-none opacity-40';

export function Paginacao({
  p,
  href,
  onChange,
  className,
}: {
  p: Pagina;
  href?: (n: number) => string;
  onChange?: (n: number) => void;
  className?: string;
}) {
  if (p.total <= 1) return null;

  // Uma funcao que devolve JSX, e nao um componente: definido aqui dentro,
  // um componente seria outro a cada render e o React refazia os botoes.
  function alvo(n: number, children: React.ReactNode, rotulo: string, atual = false) {
    const fora = n < 1 || n > p.total;
    const cls = cn(base, atual ? ativa : normal, fora && desligada);
    const comum = {
      'aria-label': rotulo,
      'aria-current': atual ? ('page' as const) : undefined,
      className: cls,
    };
    if (href) {
      return fora ? (
        <span key={rotulo} {...comum} aria-disabled>
          {children}
        </span>
      ) : (
        <Link key={rotulo} {...comum} href={href(n)} scroll={false}>
          {children}
        </Link>
      );
    }
    return (
      <button key={rotulo} {...comum} type="button" disabled={fora} onClick={() => onChange?.(n)}>
        {children}
      </button>
    );
  }

  return (
    <nav
      aria-label="Paginas"
      className={cn('flex flex-wrap items-center justify-between gap-2', className)}
    >
      <span className="text-xs tabular-nums text-muted-foreground">{p.rotulo}</span>
      <div className="flex items-center gap-0.5">
        {alvo(p.atual - 1, <ChevronLeft className="h-4 w-4" />, 'Pagina anterior')}
        {botoes(p.atual, p.total).map((n, i) =>
          n === null ? (
            <span key={`r${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            alvo(n, n, `Pagina ${n}`, n === p.atual)
          ),
        )}
        {alvo(p.atual + 1, <ChevronRight className="h-4 w-4" />, 'Pagina seguinte')}
      </div>
    </nav>
  );
}
