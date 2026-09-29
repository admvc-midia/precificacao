'use client';

/**
 * Formulario de insumo.
 *
 * ---------------------------------------------------------------------------
 * PORQUE E UM COMPONENTE DE CLIENTE COM ESTADO
 * ---------------------------------------------------------------------------
 * Os campos eram nao-controlados, com `defaultValue`. O React 19 repoe um
 * formulario assim assim que a action termina — **inclusive quando ela
 * recusa**. Resultado: escrevia-se tudo, o servidor dizia "ja existe um
 * registo com esse nome", e o ecra aparecia em branco.
 *
 * Com o valor a viver em estado de React, a reposicao do DOM nao apaga nada:
 * o que estava escrito continua la para corrigir.
 *
 * A perda e o fator de correcao sao dois campos para o mesmo numero e
 * sincronizam-se: 20% de perda e FC 1,25 dizem a mesma coisa. Quem limpa
 * carne pensa em percentagem, as tabelas de ficha tecnica publicam FC.
 */

import { useState } from 'react';

import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { fcFromWastePercent, wastePercentFromFc } from '@/lib/pricing/cost';
import type { PurchaseUnit } from '@/lib/units';

/** Tudo em texto: e o que o formulario envia e o que o servidor interpreta. */
export interface IngredientFormValues {
  id: string;
  name: string;
  category: 'FOOD' | 'PACKAGING';
  supplierId: string;
  purchasePrice: string;
  purchaseQty: string;
  purchaseUnit: PurchaseUnit;
  correctionFactor: string;
  stockBase: string;
  notes: string;
}

export const EMPTY_INGREDIENT: IngredientFormValues = {
  id: '',
  name: '',
  category: 'FOOD',
  supplierId: '',
  purchasePrice: '',
  purchaseQty: '',
  purchaseUnit: 'KG',
  correctionFactor: '1',
  stockBase: '0',
  notes: '',
};

function fmt(value: number, casas: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(casas)));
}

function parse(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function IngredientForm({
  initial = EMPTY_INGREDIENT,
  suppliers,
  idPrefix,
}: {
  initial?: IngredientFormValues;
  suppliers: Array<{ id: string; name: string }>;
  idPrefix: string;
}) {
  const [v, setV] = useState(initial);
  const fcInicial = parse(initial.correctionFactor) || 1;
  const [perda, setPerda] = useState(() => fmt(wastePercentFromFc(fcInicial) * 100, 2));

  const set = <K extends keyof IngredientFormValues>(
    campo: K,
    valor: IngredientFormValues[K],
  ) => setV((anterior) => ({ ...anterior, [campo]: valor }));

  const id = (n: string) => `${idPrefix}-${n}`;
  const perdaNum = parse(perda);
  const perdaInvalida = perdaNum >= 100 || perdaNum < 0;
  const fcNum = parse(v.correctionFactor) || 1;

  return (
    <>
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}

      <Field label="Nome" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          value={v.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Carne picada 20% gordura"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor={id('category')}>
          <Select
            id={id('category')}
            name="category"
            value={v.category}
            onChange={(e) =>
              set('category', e.target.value as IngredientFormValues['category'])
            }
          >
            <option value="FOOD">Insumo alimenticio</option>
            <option value="PACKAGING">Embalagem / descartavel</option>
          </Select>
        </Field>
        <Field label="Fornecedor" htmlFor={id('supplier')}>
          <Select
            id={id('supplier')}
            name="supplierId"
            value={v.supplierId}
            onChange={(e) => set('supplierId', e.target.value)}
          >
            <option value="">— sem fornecedor —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Preco pago" htmlFor={id('price')}>
          <Input
            id={id('price')}
            name="purchasePrice"
            inputMode="decimal"
            value={v.purchasePrice}
            onChange={(e) => set('purchasePrice', e.target.value)}
            placeholder="12,50"
            required
          />
        </Field>
        <Field label="Quantidade" htmlFor={id('qty')}>
          <Input
            id={id('qty')}
            name="purchaseQty"
            inputMode="decimal"
            value={v.purchaseQty}
            onChange={(e) => set('purchaseQty', e.target.value)}
            placeholder="5"
            required
          />
        </Field>
        <Field label="Unidade" htmlFor={id('unit')}>
          <Select
            id={id('unit')}
            name="purchaseUnit"
            value={v.purchaseUnit}
            onChange={(e) => set('purchaseUnit', e.target.value as PurchaseUnit)}
          >
            <option value="KG">kg</option>
            <option value="G">g</option>
            <option value="L">L</option>
            <option value="ML">ml</option>
            <option value="UN">unidade</option>
          </Select>
        </Field>
      </div>

      <div className="rounded-md border bg-muted/40 p-3">
        <p className="text-sm font-medium">Perda entre o que se compra e o que se usa</p>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Limpeza de carne, cascas e aparas nos insumos; caixas amassadas e sacos
          rasgados nas embalagens. Deixe 0 se nao ha perda. Os dois campos dizem a
          mesma coisa — escreva no que lhe for mais natural.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Perda (%)" htmlFor={id('waste')}>
            <Input
              id={id('waste')}
              inputMode="decimal"
              value={perda}
              aria-invalid={perdaInvalida || undefined}
              onChange={(e) => {
                setPerda(e.target.value);
                const p = parse(e.target.value);
                if (p >= 0 && p < 100) {
                  set('correctionFactor', fmt(p > 0 ? fcFromWastePercent(p / 100) : 1, 4));
                }
              }}
            />
          </Field>

          <Field
            label="Fator de correcao"
            htmlFor={id('fc')}
            hint="Peso bruto / peso liquido."
          >
            <Input
              id={id('fc')}
              // Este e o campo que o servidor le.
              name="correctionFactor"
              inputMode="decimal"
              value={v.correctionFactor}
              onChange={(e) => {
                set('correctionFactor', e.target.value);
                const f = parse(e.target.value);
                if (f > 0) setPerda(fmt(wastePercentFromFc(f) * 100, 2));
              }}
            />
          </Field>
        </div>

        {perdaInvalida ? (
          <p className="mt-2 text-xs text-destructive">
            A perda tem de estar entre 0% e 100%.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            1 kg comprado rende <strong>{fmt(1000 / (fcNum || 1), 0)} g</strong>{' '}
            aproveitaveis.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Estoque atual"
          htmlFor={id('stock')}
          hint="Na unidade base (g, ml ou un)."
        >
          <Input
            id={id('stock')}
            name="stockBase"
            inputMode="decimal"
            value={v.stockBase}
            onChange={(e) => set('stockBase', e.target.value)}
          />
        </Field>
        <Field label="Notas" htmlFor={id('notes')}>
          <Textarea
            id={id('notes')}
            name="notes"
            value={v.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </div>
    </>
  );
}
