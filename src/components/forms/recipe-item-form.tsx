'use client';

/**
 * Adicionar um item a ficha tecnica.
 *
 * Duas coisas que so se resolvem com estado no cliente:
 *
 *  - **A unidade segue o item escolhido.** Antes abria sempre em gramas, e
 *    quem escolhia oleo tinha de se lembrar de trocar para ml. Agora escolher
 *    o item ja poe a unidade certa, e so ficam disponiveis as compativeis —
 *    nao da para pedir 200 ml de um insumo vendido ao quilo.
 *  - **O que foi escrito nao se perde quando a action recusa.** Com campos
 *    nao-controlados, o React 19 repoe o formulario assim que a action
 *    termina, inclusive em caso de erro.
 */

import { useState } from 'react';

import { SubmitButton } from '@/components/action-form';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { BASE_UNIT_LABEL, compatibleUnits, UNIT_LABEL, type BaseUnit } from '@/lib/units';

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
  const [unit, setUnit] = useState<string>('G');

  const compativeis = compatibleUnits(base);
  // Se a unidade guardada nao serve para o item escolhido, mostra a base dele.
  const unidadeAtual = compativeis.includes(unit as never) ? unit : base;

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
          onChange={(e) => {
            setRef(e.target.value);
            const novo = options.find((o) => o.value === e.target.value);
            // A unidade passa a ser a do item, que e o que se quer em 9 de
            // cada 10 lancamentos.
            if (novo) setUnit(novo.baseUnit);
          }}
        >
          <option value="" disabled>
            Escolha um item…
          </option>
          {insumos.length > 0 ? (
            <optgroup label="Insumos">
              {insumos.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({BASE_UNIT_LABEL[o.baseUnit]})
                </option>
              ))}
            </optgroup>
          ) : null}
          {bases.length > 0 ? (
            <optgroup label="Preparacoes base">
              {bases.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({BASE_UNIT_LABEL[o.baseUnit]})
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantidade" htmlFor="item-qty">
          <Input
            id="item-qty"
            name="qty"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="160"
            required
          />
        </Field>
        <Field
          label="Unidade"
          htmlFor="item-unit"
          hint={
            escolhido
              ? `${escolhido.label} mede-se em ${BASE_UNIT_LABEL[base]}.`
              : 'Escolha o item primeiro.'
          }
        >
          <Select
            id="item-unit"
            name="unit"
            value={unidadeAtual}
            onChange={(e) => setUnit(e.target.value)}
          >
            {compativeis.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <SubmitButton>Adicionar a ficha</SubmitButton>
    </>
  );
}
