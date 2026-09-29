'use client';

/**
 * Formulario de insumo.
 *
 * ---------------------------------------------------------------------------
 * CRIAR E EDITAR PEDEM COISAS DIFERENTES
 * ---------------------------------------------------------------------------
 * Ao **criar**, pede-se tambem o primeiro preco: um insumo sem preco nenhum
 * daria custo zero e faria as fichas que o usam mentir em silencio.
 *
 * Ao **editar**, os campos de preco desaparecem. O preco vive na lista de
 * fornecedores, ao lado — um acucar comprado no Continente e no Makro tem
 * dois precos, nao um, e obrigar a escolher um aqui era o que levava a
 * cadastrar o mesmo item duas vezes.
 *
 * ---------------------------------------------------------------------------
 * PORQUE E UM COMPONENTE DE CLIENTE COM ESTADO
 * ---------------------------------------------------------------------------
 * Os campos eram nao-controlados, com `defaultValue`. O React 19 repoe um
 * formulario assim assim que a action termina — **inclusive quando ela
 * recusa**. Resultado: escrevia-se tudo, o servidor dizia "ja existe um
 * registo com esse nome", e o ecra aparecia em branco. Com o valor em estado
 * de React, a reposicao do DOM nao apaga nada.
 *
 * A perda e o fator de correcao sao dois campos para o mesmo numero e
 * sincronizam-se: 20% de perda e FC 1,25 dizem a mesma coisa. Quem limpa
 * carne pensa em percentagem, as tabelas de ficha tecnica publicam FC.
 */

import { useState } from 'react';

import { useActionFormState } from '@/components/action-form';
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

/** Rotulo da familia de medida do insumo. */
const MEDIDA: Record<PurchaseUnit, string> = {
  KG: 'quilos / gramas',
  G: 'quilos / gramas',
  L: 'litros / mililitros',
  ML: 'litros / mililitros',
  UN: 'unidades',
};

/** Tamanhos de embalagem possiveis dentro de cada familia. */
const UNIDADES: Record<'KG' | 'L' | 'UN', Array<{ value: PurchaseUnit; label: string }>> =
  {
    KG: [
      { value: 'KG', label: 'kg' },
      { value: 'G', label: 'g' },
    ],
    L: [
      { value: 'L', label: 'L' },
      { value: 'ML', label: 'ml' },
    ],
    UN: [{ value: 'UN', label: 'unidade' }],
  };

function familia(u: PurchaseUnit): 'KG' | 'L' | 'UN' {
  if (u === 'KG' || u === 'G') return 'KG';
  if (u === 'L' || u === 'ML') return 'L';
  return 'UN';
}

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
  const estado = useActionFormState();
  const parecidos = estado.similar ?? [];

  const fcInicial = parse(initial.correctionFactor) || 1;
  const [perda, setPerda] = useState(() => fmt(wastePercentFromFc(fcInicial) * 100, 2));

  // Um insumo ja existente tem a sua lista de precos ao lado: aqui so se
  // editam as caracteristicas dele.
  const aEditar = Boolean(initial.id);

  // A familia so filtra as unidades de embalagem possiveis; nao e enviada.
  // O que o servidor recebe e a unidade da embalagem, e a familia deduz-se
  // dela. Dois campos a disputar o mesmo nome dariam a unidade errada.
  const [fam, setFam] = useState<'KG' | 'L' | 'UN'>(() => familia(initial.purchaseUnit));

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
          placeholder="Acucar refinado"
          required
        />
      </Field>

      {parecidos.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="font-medium">Ja existe algo parecido:</p>
          <ul className="mt-1 list-disc pl-5">
            {parecidos.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Se for o mesmo insumo comprado noutro sitio, feche esta janela, abra o
            que ja existe e acrescente la o preco do outro fornecedor.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="confirmDuplicate"
              value="1"
              className="h-4 w-4 rounded border-input"
            />
            Sao coisas diferentes, criar mesmo assim
          </label>
        </div>
      ) : null}

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

        <Field
          label="Medido em"
          htmlFor={id('unit')}
          hint={
            aEditar
              ? 'Nao se altera: os precos ja registados dependem desta medida.'
              : 'A familia de medida, nao o tamanho da embalagem.'
          }
        >
          {aEditar ? (
            <>
              <input type="hidden" name="purchaseUnit" value={v.purchaseUnit} />
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                {MEDIDA[v.purchaseUnit]}
              </div>
            </>
          ) : (
            <Select
              id={id('unit')}
              value={fam}
              onChange={(e) => {
                const nova = e.target.value as 'KG' | 'L' | 'UN';
                setFam(nova);
                set('purchaseUnit', UNIDADES[nova][0].value);
              }}
            >
              <option value="KG">quilos / gramas</option>
              <option value="L">litros / mililitros</option>
              <option value="UN">unidades</option>
            </Select>
          )}
        </Field>
      </div>

      {aEditar ? null : (
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-medium">Primeiro preco</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            Onde compra hoje. Depois de guardar, pode acrescentar os outros
            fornecedores deste mesmo insumo e comparar.
          </p>

          <Field label="Fornecedor" htmlFor={id('supplier')}>
            <Select
              id={id('supplier')}
              name="supplierId"
              value={v.supplierId}
              onChange={(e) => set('supplierId', e.target.value)}
            >
              <option value="">— nao registar —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Preco pago" htmlFor={id('price')}>
              <Input
                id={id('price')}
                name="purchasePrice"
                inputMode="decimal"
                value={v.purchasePrice}
                onChange={(e) => set('purchasePrice', e.target.value)}
                placeholder="1,69"
                required
              />
            </Field>
            <Field
              label="Embalagem"
              htmlFor={id('qty')}
              hint="O tamanho que se compra."
            >
              <Input
                id={id('qty')}
                name="purchaseQty"
                inputMode="decimal"
                value={v.purchaseQty}
                onChange={(e) => set('purchaseQty', e.target.value)}
                placeholder="1"
                required
              />
            </Field>
            <Field label="Unidade" htmlFor={id('packunit')}>
              <Select
                id={id('packunit')}
                name="purchaseUnit"
                value={v.purchaseUnit}
                onChange={(e) => set('purchaseUnit', e.target.value as PurchaseUnit)}
              >
                {UNIDADES[fam].map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}

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
                  set(
                    'correctionFactor',
                    fmt(p > 0 ? fcFromWastePercent(p / 100) : 1, 4),
                  );
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
