'use client';

/**
 * Uma linha de lista de compras, para o telemovel: um circulo, o nome, a
 * quantidade e o preco. Nada mais a vista.
 *
 * Dois alvos de toque, de proposito separados:
 *  - o **circulo** (44 px, o minimo para um polegar a andar) risca;
 *  - o **resto da linha** abre o detalhe por baixo — loja, preco por kg,
 *    botoes. Riscar por engano ao querer ver o preco era o risco de uma linha
 *    que fizesse as duas coisas.
 *
 * Partilhada pela aba Compras e pela lista de cada ordem de producao, para as
 * duas se lerem igual.
 */

import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export function LinhaCompra({
  nome,
  quantidade,
  preco,
  feito,
  apagado = false,
  aberto,
  onRiscar,
  onAbrir,
  children,
  rotuloRiscar,
}: {
  nome: string;
  /** "3× 0,395 kg" */
  quantidade: string;
  /** Ja formatado na moeda. */
  preco: string;
  feito: boolean;
  /** "Nao havia": esbatido, sem estar riscado. */
  apagado?: boolean;
  aberto: boolean;
  /** Sem isto o circulo nao risca (lista fechada). */
  onRiscar?: () => void;
  onAbrir: () => void;
  /** O detalhe, quando aberto. */
  children?: React.ReactNode;
  rotuloRiscar?: string;
}) {
  const circulo = (
    <span
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
        feito ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
      )}
    >
      {feito ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </span>
  );

  return (
    <li className={cn(aberto && 'bg-muted/30')}>
      <div className="flex items-center">
        {onRiscar ? (
          <button
            type="button"
            onClick={onRiscar}
            aria-pressed={feito}
            aria-label={rotuloRiscar ?? `${nome}: ${feito ? 'tirar do carrinho' : 'por no carrinho'}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center"
          >
            {circulo}
          </button>
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden>
            {circulo}
          </span>
        )}
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              (feito || apagado) && 'text-muted-foreground',
              feito && 'line-through',
            )}
          >
            {nome}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{quantidade}</span>
          <span
            className={cn(
              'w-16 shrink-0 text-right text-sm tabular-nums',
              feito || apagado ? 'text-muted-foreground' : 'font-medium',
            )}
          >
            {preco}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>
      {aberto && children ? <div className="space-y-2 pb-3 pl-12 pr-3 text-sm">{children}</div> : null}
    </li>
  );
}

/**
 * Uma secao que comeca fechada, com contagem: "No carrinho (3)". O que ja
 * foi resolvido sai do caminho, sem desaparecer.
 */
export function SecaoFechada({
  titulo,
  n,
  children,
}: {
  titulo: string;
  n: number;
  children: React.ReactNode;
}) {
  if (n === 0) return null;
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        {titulo}
        <span className="text-muted-foreground">({n})</span>
      </summary>
      <ul className="divide-y border-t">{children}</ul>
    </details>
  );
}
