'use client';

/**
 * A composicao de uma ficha tecnica.
 *
 * ---------------------------------------------------------------------------
 * PORQUE OS CUSTOS COMECAM ESCONDIDOS
 * ---------------------------------------------------------------------------
 * Uma ficha tecnica serve duas pessoas. Na cozinha le-se o que leva e quanto
 * leva, e o dinheiro so atrapalha; no escritorio quer-se ver para onde vai o
 * custo. Como a mesma pagina serve as duas, o dinheiro fica atras de um
 * botao, e a escolha guarda-se neste browser — ninguem quer carregar no
 * mesmo botao todas as vezes.
 *
 * Esconde-se tambem o total do lote: mostrar a soma com as parcelas tapadas
 * so levantaria a pergunta de onde e que ela vem.
 *
 * As quantidades vem ja formatadas do servidor, sempre em kg ou unidades — a
 * conversao depende da unidade base do insumo, que so o servidor conhece.
 */

import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useStoredString } from '@/lib/use-stored-state';

export interface CompositionRow {
  id: string;
  /** Nome, com a etiqueta de sub-receita por baixo. */
  name: React.ReactNode;
  /** "0,015 kg" — sempre na unidade de exibicao. */
  qty: string;
  /** "1,69 €/kg" */
  unitCost: string;
  /** Quanto esta linha custa no lote. */
  cost: string;
  actions: React.ReactNode;
}

export function CompositionTable({
  rows,
  total,
}: {
  rows: CompositionRow[];
  /**
   * Total do lote, como dados e nao como `<tr>` pronto.
   *
   * Ja chegou aqui renderizado do servidor, mas com colunas que aparecem e
   * desaparecem a contagem de celulas deixava de bater e a linha desalinhava.
   */
  total?: { label: string; value: string };
}) {
  const [modo, setModo] = useStoredString('composicao:custos', 'oculto');
  const mostraCustos = modo === 'visivel';

  const botao = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setModo(mostraCustos ? 'oculto' : 'visivel')}
      className="text-muted-foreground"
      aria-pressed={mostraCustos}
    >
      {mostraCustos ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
      {mostraCustos ? 'Ocultar custos' : 'Ver custos'}
    </Button>
  );

  return (
    <div>
      <div className="flex items-center justify-end px-4 pb-2 sm:px-6">{botao}</div>

      {/* Ecra grande: tabela. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Quantidade</th>
              {mostraCustos ? (
                <>
                  <th className="px-3 py-2.5 text-right font-medium">Custo unitario</th>
                  <th className="px-3 py-2.5 text-right font-medium">Custo no lote</th>
                </>
              ) : null}
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.qty}</td>
                {mostraCustos ? (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.unitCost}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {r.cost}
                    </td>
                  </>
                ) : null}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end">{r.actions}</div>
                </td>
              </tr>
            ))}
          </tbody>
          {total && mostraCustos ? (
            <tfoot className="border-t bg-muted/50">
              <tr>
                <td className="px-3 py-2.5">{total.label}</td>
                <td />
                <td />
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  {total.value}
                </td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Telemovel: cartoes. */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">{r.name}</div>
                {mostraCustos ? (
                  <span className="shrink-0 tabular-nums font-medium">{r.cost}</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.qty}
                {mostraCustos ? ` · ${r.unitCost}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center">{r.actions}</div>
          </li>
        ))}
      </ul>

      {total && mostraCustos ? (
        <div className="flex items-baseline justify-between border-t bg-muted/50 px-4 py-3 text-sm md:hidden">
          <span>{total.label}</span>
          <span className="tabular-nums font-medium">{total.value}</span>
        </div>
      ) : null}
    </div>
  );
}
