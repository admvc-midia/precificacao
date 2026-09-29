'use client';

/**
 * A composicao de uma ficha tecnica, com as quantidades em duas leituras.
 *
 * **Como lancado** mostra o que foi escrito: 1500 g, porque foi assim que se
 * digitou. **Escala legivel** mostra 1,5 kg, que e como se fala.
 *
 * Nenhuma das duas e a certa sempre. Quem confere uma receita quer ver o que
 * escreveu; quem esta a ler a ficha em voz alta na cozinha quer quilos. Por
 * isso e um botao, e a escolha fica guardada neste browser — ninguem quer
 * carregar no mesmo botao todas as vezes.
 *
 * As duas versoes vem ja formatadas do servidor: a conversao depende da
 * unidade base do insumo, que so o servidor conhece.
 */

import { Ruler } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useStoredString } from '@/lib/use-stored-state';
import { cn } from '@/lib/utils';

export interface CompositionRow {
  id: string;
  /** Nome, com a etiqueta de sub-receita por baixo. */
  name: React.ReactNode;
  /** "1500 g" — tal como foi lancado. */
  qtyAsEntered: string;
  /** "1,5 kg" — na escala que se le melhor. */
  qtyScaled: string;
  unitCost: string;
  cost: string;
  actions: React.ReactNode;
}

export function CompositionTable({
  rows,
  footer,
}: {
  rows: CompositionRow[];
  /** Linha de total, ja formatada. */
  footer?: React.ReactNode;
}) {
  const [modo, setModo] = useStoredString('composicao:escala', 'entrada');
  const escalado = modo === 'escala';

  // Se nenhuma linha muda com a conversao, o botao nao tem o que fazer.
  const converteAlguma = rows.some((r) => r.qtyAsEntered !== r.qtyScaled);

  return (
    <div>
      {converteAlguma ? (
        <div className="flex items-center justify-end px-4 pb-2 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModo(escalado ? 'entrada' : 'escala')}
            className="text-muted-foreground"
            aria-pressed={escalado}
          >
            <Ruler className="h-4 w-4" />
            {escalado ? 'Ver como foi lancado' : 'Converter para kg, L'}
          </Button>
        </div>
      ) : null}

      {/* Ecra grande: tabela. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Quantidade</th>
              <th className="px-3 py-2.5 text-right font-medium">Custo unitario</th>
              <th className="px-3 py-2.5 text-right font-medium">Custo no lote</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Quantidade row={r} escalado={escalado} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.unitCost}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  {r.cost}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end">{r.actions}</div>
                </td>
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="border-t bg-muted/50">{footer}</tfoot> : null}
        </table>
      </div>

      {/* Telemovel: cartoes. */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">{r.name}</div>
                <span className="shrink-0 tabular-nums font-medium">{r.cost}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Quantidade row={r} escalado={escalado} /> · {r.unitCost}
              </p>
            </div>
            <div className="flex shrink-0 items-center">{r.actions}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Quantidade({ row, escalado }: { row: CompositionRow; escalado: boolean }) {
  const mostra = escalado ? row.qtyScaled : row.qtyAsEntered;
  const outra = escalado ? row.qtyAsEntered : row.qtyScaled;
  const diferente = mostra !== outra;

  return (
    <span className={cn(diferente && 'cursor-help')} title={diferente ? outra : undefined}>
      {mostra}
    </span>
  );
}
