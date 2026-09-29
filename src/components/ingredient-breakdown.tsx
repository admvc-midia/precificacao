'use client';

/**
 * Quanto de cada insumo entra numa porcao.
 *
 * Duas vistas da mesma coisa, porque respondem a perguntas diferentes:
 *
 *  - **Como na ficha** e o que o cozinheiro ve: "30 ml de maionese da casa".
 *  - **Ingredientes base** desce pelas sub-receitas ate ao que se compra:
 *    o ovo e o oleo que estao dentro dessa maionese.
 *
 * As duas chegam ja calculadas e formatadas do servidor; aqui so se alterna.
 *
 * A coluna que faz a diferenca e a percentagem do custo. Saber que o
 * hamburguer custa 1,24 EUR nao diz onde mexer; saber que 45% disso e a
 * carne, diz.
 */

import { useState } from 'react';

import { cn } from '@/lib/utils';

export interface BreakdownRow {
  id: string;
  name: string;
  /** "via Maionese da casa", quando nao entra direto na ficha. */
  via?: string;
  /** Quantidade que vai no prato, ja formatada. */
  plate: string;
  /** Quantidade que e preciso comprar. Difere de `plate` se houver perda. */
  buy: string;
  /** Ha fator de correcao, logo `plate` e `buy` divergem. */
  hasLoss: boolean;
  unitCost: string;
  cost: string;
  /** Fracao do custo total desta porcao, de 0 a 1. */
  share: number;
  shareLabel: string;
  isPackaging: boolean;
}

export function IngredientBreakdown({
  flat,
  asRecipe,
  totalLabel,
  productCostLabel,
}: {
  /** Achatado ate aos insumos basicos. */
  flat: BreakdownRow[];
  /** Como esta escrito na ficha, com as sub-receitas inteiras. */
  asRecipe: BreakdownRow[];
  /** Tudo, incluindo a embalagem de transporte. */
  totalLabel: string;
  /**
   * Custo do produto: sem a embalagem de transporte, que so e cobrada nos canais
   * de entrega. E este o numero que aparece no cartao la em cima, e sem o
   * dizer os dois totais na mesma pagina pareciam uma contradicao.
   */
  productCostLabel: string;
}) {
  const [base, setBase] = useState(true);
  const rows = base ? flat : asRecipe;

  // Se nenhuma linha tem perda, a coluna "a comprar" seria igual a "no prato"
  // em toda a tabela — nesse caso nao vale o espaco que ocupa.
  const mostrarCompra = rows.some((r) => r.hasLoss);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Como mostrar a composicao"
          className="inline-flex rounded-md border p-0.5"
        >
          <Opcao ativo={base} onClick={() => setBase(true)}>
            Ingredientes base
          </Opcao>
          <Opcao ativo={!base} onClick={() => setBase(false)}>
            Como na ficha
          </Opcao>
        </div>
        <span className="text-right text-sm text-muted-foreground">
          <span className="block">
            Custo do produto:{' '}
            <strong className="tabular-nums text-foreground">{productCostLabel}</strong>
          </span>
          <span className="block text-xs">
            com embalagem de transporte:{' '}
            <span className="tabular-nums">{totalLabel}</span>
          </span>
        </span>
      </div>

      {/* Ecra grande: tabela. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 text-left font-medium">Insumo</th>
              <th className="px-3 py-2 text-right font-medium">No prato</th>
              {mostrarCompra ? (
                <th className="px-3 py-2 text-right font-medium">A comprar</th>
              ) : null}
              <th className="px-3 py-2 text-right font-medium">Custo/un</th>
              <th className="px-3 py-2 text-right font-medium">Custo</th>
              <th className="py-2 pl-3 text-right font-medium">% do custo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <Nome row={r} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.plate}</td>
                {mostrarCompra ? (
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      r.hasLoss ? 'font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {r.buy}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.unitCost}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {r.cost}
                </td>
                <td className="py-2 pl-3">
                  <Fatia row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Telemovel: cartoes. */}
      <ul className="divide-y rounded-md border md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1.5 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Nome row={r} />
              <span className="shrink-0 tabular-nums font-medium">{r.cost}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.plate} no prato
              {r.hasLoss ? (
                <>
                  {' · '}
                  <span className="font-medium text-foreground">{r.buy} a comprar</span>
                </>
              ) : null}
              {' · '}
              {r.unitCost}
            </p>
            <Fatia row={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Opcao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded px-3 py-1.5 text-sm transition-colors',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Nome({ row }: { row: BreakdownRow }) {
  return (
    <span className="min-w-0">
      <span className={cn('font-medium', row.isPackaging && 'text-muted-foreground')}>
        {row.name}
      </span>
      {row.via ? (
        <span className="block text-xs text-muted-foreground">↳ {row.via}</span>
      ) : null}
      {row.isPackaging && !row.via ? (
        <span className="block text-xs text-muted-foreground">embalagem</span>
      ) : null}
    </span>
  );
}

/** Barra fina de proporcao. Uma serie so, por isso nao precisa de legenda. */
function Fatia({ row }: { row: BreakdownRow }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-20"
        role="img"
        aria-label={`${row.shareLabel} do custo`}
      >
        <span
          className={cn(
            'block h-full rounded-full',
            row.isPackaging ? 'bg-muted-foreground/50' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, row.share * 100)}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {row.shareLabel}
      </span>
    </span>
  );
}
