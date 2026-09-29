import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Campo de quantidade com a unidade encostada por dentro.
 *
 * Substitui o par "caixa de texto + menu de unidades" que estava em cinco
 * formularios. O menu tinha uma so opcao desde que a aplicacao passou a falar
 * apenas kg e unidades — um menu de uma opcao e um clique que nao decide
 * nada, e ainda por cima deixava supor que havia outra escolha possivel.
 *
 * A unidade continua a ser submetida, por um campo escondido, para as actions
 * do servidor nao terem de adivinhar em que escala veio o numero.
 */
export function QtyInput({
  unitLabel,
  unitName,
  unitValue,
  className,
  ...props
}: React.ComponentProps<'input'> & {
  /** O que se le dentro do campo: "kg", "un". */
  unitLabel: string;
  /** Nome do campo escondido que leva a unidade. Omitir se nao for preciso. */
  unitName?: string;
  /** Valor submetido: "KG", "UN". */
  unitValue?: string;
}) {
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        // Espaco a direita para o rotulo nao ficar por cima dos algarismos.
        className={cn('pr-12 text-right tabular-nums', className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {unitLabel}
      </span>
      {unitName && unitValue ? (
        <input type="hidden" name={unitName} value={unitValue} />
      ) : null}
    </div>
  );
}
