'use client';

/**
 * Adicionar um item a ficha tecnica.
 *
 * Duas coisas que so se resolvem com estado no cliente:
 *
 *  - **A unidade segue o item escolhido**, e nao se escolhe. Um insumo a
 *    peso lanca-se em kg, um contavel em unidades, e o rotulo dentro do campo
 *    muda assim que se escolhe o item. Antes era um menu ao lado, que so
 *    servia para se poder enganar.
 *  - **O que foi escrito nao se perde quando a action recusa.** Com campos
 *    nao-controlados, o React 19 repoe o formulario assim que a action
 *    termina, inclusive em caso de erro.
 */

import { useState } from 'react';

import { SubmitButton } from '@/components/action-form';
import { Field, Select } from '@/components/ui/form-controls';
import { QtyInput } from '@/components/ui/qty-input';
import { displayUnitOf, DISPLAY_UNIT_LABEL, type BaseUnit } from '@/lib/units';

export interface ItemOption {
  /** "ING:<id>" ou "REC:<id>", como a action espera. */
  value: string;
  label: string;
  baseUnit: BaseUnit;
  group: 'Insumos' | 'Preparacoes base';
}

export function RecipeItemForm({
  recipeId,
  options,
}: {
  recipeId: string;
  options: ItemOption[];
}) {
  const [ref, setRef] = useState('');
  const [qty, setQty] = useState('');

  const escolhido = options.find((o) => o.value === ref);
  const base: BaseUnit = escolhido?.baseUnit ?? 'G';
  // A unidade nao se escolhe: e a do item. Um insumo a peso lanca-se em kg,
  // um contavel em unidades, e nao ha terceira hipotese.
  const unidade = DISPLAY_UNIT_LABEL[base];

  const insumos = options.filter((o) => o.group === 'Insumos');
  const bases = options.filter((o) => o.group === 'Preparacoes base');

  return (
    <>
      <input type="hidden" name="recipeId" value={recipeId} />

      <Field label="Item" htmlFor="item-ref">
        <Select
          id="item-ref"
          name="ref"
          required
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        >
          <option value="" disabled>
            Escolha um item…
          </option>
          {insumos.length > 0 ? (
            <optgroup label="Insumos">
              {insumos.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({DISPLAY_UNIT_LABEL[o.baseUnit]})
                </option>
              ))}
            </optgroup>
          ) : null}
          {bases.length > 0 ? (
            <optgroup label="Preparacoes base">
              {bases.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({DISPLAY_UNIT_LABEL[o.baseUnit]})
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>

      <Field
        label="Quantidade"
        htmlFor="item-qty"
        hint="Do lote inteiro, nao da porcao."
      >
        <QtyInput
          id="item-qty"
          name="qty"
          unitLabel={unidade}
          unitName="unit"
          unitValue={displayUnitOf(base)}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0,16"
          required
        />
      </Field>

      <SubmitButton>Adicionar a ficha</SubmitButton>
    </>
  );
}
