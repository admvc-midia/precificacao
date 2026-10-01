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
import { ChevronDown } from 'lucide-react';

import { useActionFormState } from '@/components/action-form';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { QtyInput } from '@/components/ui/qty-input';
import { fcFromWastePercent, wastePercentFromFc } from '@/lib/pricing/cost';
import {
  ALLERGENS,
  ALLERGEN_HINT,
  ALLERGEN_LABEL,
} from '@/lib/pricing/allergens';
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
  minStockBase: string;
  allergens: string[];
  allergensReviewed: boolean;
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
  minStockBase: '',
  allergens: [],
  allergensReviewed: false,
  notes: '',
};

/**
 * Rotulo da familia de medida do insumo.
 *
 * ---------------------------------------------------------------------------
 * PORQUE NAO HA LITROS AQUI
 * ---------------------------------------------------------------------------
 * Nesta casa tudo se compra e lanca a peso ou a unidade — os liquidos
 * inclusive, que vao a balanca. Oferecer litros so criava a duvida de qual
 * escolher, e pior: obrigaria a converter volume em peso algures, e essa
 * conversao depende da densidade (1 L de oleo sao 920 g, de mel sao 1400 g).
 * A aplicacao nao tem como saber isso e nao deve adivinhar.
 *
 * A biblioteca de unidades continua a saber converter L e ml — um CSV de
 * fornecedor pode traze-los, e internamente funcionam. So nao se oferecem
 * aqui.
 */
const MEDIDA: Record<PurchaseUnit, string> = {
  KG: 'peso (kg)',
  G: 'peso (kg)',
  L: 'volume (L)',
  ML: 'volume (L)',
  UN: 'unidades',
};

/**
 * Uma unidade por familia, e nao uma lista.
 *
 * Uma embalagem de 200 g escreve-se `0,2 kg`. Dar tambem "g" obrigaria a
 * decidir a cada cadastro, e duas pessoas a cadastrar o mesmo acucar em
 * escalas diferentes e como se aparecesse duas vezes na lista.
 */
const UNIDADE: Record<'KG' | 'UN', { value: PurchaseUnit; label: string }> = {
  KG: { value: 'KG', label: 'kg' },
  UN: { value: 'UN', label: 'un' },
};

function familia(u: PurchaseUnit): 'KG' | 'UN' {
  return u === 'UN' ? 'UN' : 'KG';
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
  const [fam, setFam] = useState<'KG' | 'UN'>(() => familia(initial.purchaseUnit));

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
              : 'Liquidos tambem vao a peso.'
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
                const nova = e.target.value as 'KG' | 'UN';
                setFam(nova);
                set('purchaseUnit', UNIDADE[nova].value);
              }}
            >
              <option value="KG">peso — kg</option>
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

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              label="Tamanho da embalagem"
              htmlFor={id('qty')}
              hint={
                fam === 'KG'
                  ? 'Uma caixa de 200 g escreve-se 0,2.'
                  : 'Quantas unidades vem no pacote.'
              }
            >
              <QtyInput
                id={id('qty')}
                name="purchaseQty"
                unitLabel={UNIDADE[fam].label}
                unitName="purchaseUnit"
                unitValue={UNIDADE[fam].value}
                value={v.purchaseQty}
                onChange={(e) => set('purchaseQty', e.target.value)}
                placeholder="1"
                required
              />
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
          hint="O que tem no armazem agora."
        >
          <QtyInput
            id={id('stock')}
            name="stockBase"
            unitLabel={UNIDADE[fam].label}
            value={v.stockBase}
            onChange={(e) => set('stockBase', e.target.value)}
          />
        </Field>
        <Field
          label="Avisar abaixo de"
          htmlFor={id('min')}
          hint="Deixe vazio para nao avisar."
        >
          <QtyInput
            id={id('min')}
            name="minStockBase"
            unitLabel={UNIDADE[fam].label}
            value={v.minStockBase}
            onChange={(e) => set('minStockBase', e.target.value)}
            placeholder="—"
          />
        </Field>
      </div>

      {/* ------------------------------------------------ alergenios */}
      {/* Fechado por omissao: usa-se pouco, e catorze caixas empurravam o resto
          do formulario para baixo. O resumo no titulo diz o essencial sem abrir.
          Fechar um <details> nao tira os campos do formulario: o que estiver
          marcado continua a ser enviado. */}
      <details className="group rounded-md border bg-muted/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
          <span className="font-medium">Alergenios</span>
          <span className="text-muted-foreground">
            ·{' '}
            {v.allergens.length === 0
              ? 'nenhum declarado'
              : v.allergens.map((a) => ALLERGEN_LABEL[a as keyof typeof ALLERGEN_LABEL]).join(', ')}
            {' · '}
            {v.allergensReviewed ? 'verificado' : 'por verificar'}
          </span>
        </summary>
        <div className="px-3 pb-3">
        <p className="mb-3 text-xs text-muted-foreground">
          Os catorze do Anexo II do Regulamento (UE) 1169/2011. As fichas que
          usarem este insumo passam a mostra-los.
        </p>

        {/* Sem este marcador, um formulario que nao traga a caixa e um em que
            ela foi desmarcada chegam iguais ao servidor. */}
        <input type="hidden" name="allergensSubmitted" value="1" />

        <label className="mb-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="allergensReviewed"
            checked={v.allergensReviewed}
            onChange={(e) => set('allergensReviewed', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            Ja verifiquei este insumo
            <span className="block text-xs text-muted-foreground">
              Sem isto, a ficha nao diz &quot;sem alergenios&quot; — diz que ha
              insumos por verificar. E a unica diferenca que importa num aviso
              de alergenios.
            </span>
          </span>
        </label>

        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {ALLERGENS.map((a) => (
            <label key={a} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="allergens"
                value={a}
                checked={v.allergens.includes(a)}
                onChange={(e) =>
                  set(
                    'allergens',
                    e.target.checked
                      ? [...v.allergens, a]
                      : v.allergens.filter((x) => x !== a),
                  )
                }
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                {ALLERGEN_LABEL[a]}
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {ALLERGEN_HINT[a]}
                </span>
              </span>
            </label>
          ))}
        </div>
        </div>
      </details>

      <Field label="Notas" htmlFor={id('notes')}>
        <Textarea
          id={id('notes')}
          name="notes"
          value={v.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>
    </>
  );
}
