'use client';

/**
 * Editar um insumo: o que ele e, e onde se compra.
 *
 * As duas coisas ficam na mesma janela, uma por baixo da outra. Antes, os
 * precos estavam atras de um icone de loja sem legenda na linha da tabela —
 * quem nao soubesse que existia cadastrava o mesmo item outra vez para
 * registar o segundo fornecedor. Foi o que aconteceu com o acucar.
 *
 * Cada preco **altera-se no sitio**. Durante algum tempo so se podia
 * acrescentar e remover, e como o ultimo preco de um insumo nao se apaga, um
 * tamanho de embalagem mal escrito nao tinha como ser corrigido.
 *
 * Sao **formularios irmaos**, nao aninhados: HTML nao permite um `<form>`
 * dentro de outro, e cada preco tem as suas proprias accoes.
 */

import { useState } from 'react';
import { Check, Pencil, Star, Trash2 } from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  SubmitButton,
  type ActionState,
} from '@/components/action-form';
import { IngredientForm, type IngredientFormValues } from '@/components/forms/ingredient-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/form-controls';
import { QtyInput } from '@/components/ui/qty-input';
import { Input } from '@/components/ui/input';

export interface PriceRow {
  id: string;
  supplierName: string;
  /** `null` quando o preco foi registado sem fornecedor. */
  supplierId: string | null;
  /** "1,69 € ÷ 1 kg" */
  packLabel: string;
  /** "1,69 €/kg" */
  unitCostLabel: string;
  cheapest: boolean;
  inUse: boolean;
  /** "+41%" quando nao e o mais barato. */
  premiumLabel: string | null;
  /** Os valores em bruto, para o formulario de alteracao. */
  form: { purchasePrice: string; purchaseQty: string; sku: string };
}

/** A unidade deste insumo: kg ou un. Nao ha escolha. */
interface Unidade {
  value: string;
  label: string;
}

export function IngredientDialog({
  ingredient,
  suppliers,
  unit,
  prices,
  saveIngredient,
  saveOffer,
  deleteOffer,
  setOfferInUse,
  trigger,
}: {
  ingredient: IngredientFormValues;
  suppliers: Array<{ id: string; name: string }>;
  unit: Unidade;
  prices: PriceRow[];
  saveIngredient: (s: ActionState, f: FormData) => Promise<ActionState>;
  saveOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  deleteOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  setOfferInUse: (s: ActionState, f: FormData) => Promise<ActionState>;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** `'novo'`, o id do preco a alterar, ou nada aberto. */
  const [aEditar, setAEditar] = useState<string | null>(null);

  const emUso = prices.find((p) => p.inUse);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ingredient.name}</DialogTitle>
          <DialogDescription>
            {emUso ? (
              <>
                A aplicacao usa o preco de <strong>{emUso.supplierName}</strong>:{' '}
                {emUso.packLabel}. E esse que alimenta o custo das fichas.
              </>
            ) : (
              'Este insumo ainda nao tem preco.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ---------------------------------------------- onde se compra */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Onde se compra</h3>
            {aEditar === null ? (
              <Button variant="outline" size="sm" onClick={() => setAEditar('novo')}>
                + Acrescentar fornecedor
              </Button>
            ) : null}
          </div>

          <ul className="divide-y rounded-md border">
            {prices.map((p) =>
              aEditar === p.id ? (
                <li key={p.id} className="bg-muted/40 px-3 py-3">
                  <FormularioPreco
                    ingredientId={ingredient.id}
                    offer={p}
                    suppliers={suppliers}
                    unit={unit}
                    action={saveOffer}
                    onCancel={() => setAEditar(null)}
                  />
                </li>
              ) : (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{p.supplierName}</span>
                      {p.inUse ? (
                        <Badge>
                          <Star className="mr-1 h-3 w-3" aria-hidden />
                          em uso
                        </Badge>
                      ) : null}
                      {p.cheapest && !p.inUse ? (
                        <Badge variant="success">mais barato</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.packLabel} · {p.unitCostLabel}
                      {p.premiumLabel ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {' '}
                          · {p.premiumLabel} mais caro
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {p.inUse ? null : (
                      <ActionForm action={setOfferInUse} showSuccess={false}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton size="sm" variant="outline" pendingLabel="…">
                          <Check className="h-3.5 w-3.5" />
                          Usar este
                        </SubmitButton>
                      </ActionForm>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setAEditar(p.id)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">
                        Alterar preco e tamanho da embalagem
                      </span>
                    </Button>

                    <ConfirmDelete
                      action={deleteOffer}
                      fields={{ id: p.id }}
                      title={`Remover o preco de ${p.supplierName}?`}
                      description={
                        p.inUse
                          ? 'Este e o preco em uso. Ao remove-lo, o insumo passa a usar o mais barato dos restantes e o custo das fichas e recalculado.'
                          : 'O preco do insumo nao muda; so deixa de haver esta alternativa para comparar.'
                      }
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remover</span>
                        </Button>
                      }
                    />
                  </div>
                </li>
              ),
            )}
          </ul>

          {aEditar === 'novo' ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <FormularioPreco
                ingredientId={ingredient.id}
                suppliers={suppliers}
                unit={unit}
                action={saveOffer}
                onCancel={() => setAEditar(null)}
              />
            </div>
          ) : null}
        </section>

        {/* ---------------------------------------------- o que o item e */}
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Caracteristicas do insumo</h3>

          <ActionForm action={saveIngredient}>
            <IngredientForm
              initial={ingredient}
              suppliers={suppliers}
              idPrefix={`edit-${ingredient.id}`}
            />
            <SubmitButton>Guardar alteracoes</SubmitButton>
          </ActionForm>
        </section>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O mesmo formulario serve para acrescentar e para alterar.
 *
 * A diferenca e o `id` escondido: com ele a action altera aquela linha, sem
 * ele cria uma. Duplicar este bloco era garantir que um dos dois ficasse para
 * tras na proxima alteracao.
 */
function FormularioPreco({
  ingredientId,
  offer,
  suppliers,
  unit,
  action,
  onCancel,
}: {
  ingredientId: string;
  offer?: PriceRow;
  suppliers: Array<{ id: string; name: string }>;
  unit: Unidade;
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  onCancel: () => void;
}) {
  const id = (n: string) => `of-${offer?.id ?? 'novo'}-${ingredientId}-${n}`;

  return (
    <ActionForm action={action}>
      <input type="hidden" name="ingredientId" value={ingredientId} />
      {offer ? <input type="hidden" name="id" value={offer.id} /> : null}

      <Field label="Fornecedor" htmlFor={id('sup')}>
        <Select id={id('sup')} name="supplierId" defaultValue={offer?.supplierId ?? ''}>
          <option value="">— nao registar —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preco pago" htmlFor={id('price')}>
          <Input
            id={id('price')}
            name="purchasePrice"
            inputMode="decimal"
            defaultValue={offer?.form.purchasePrice}
            placeholder="1,20"
            required
          />
        </Field>
        <Field
          label="Tamanho da embalagem"
          htmlFor={id('qty')}
          hint={
            unit.value === 'UN'
              ? 'Quantas unidades vem no pacote.'
              : `Uma caixa de 200 g escreve-se 0,2 ${unit.label}.`
          }
        >
          <QtyInput
            id={id('qty')}
            name="purchaseQty"
            unitLabel={unit.label}
            unitName="purchaseUnit"
            unitValue={unit.value}
            defaultValue={offer?.form.purchaseQty}
            placeholder="1"
            required
          />
        </Field>
      </div>

      <Field label="Referencia no fornecedor" htmlFor={id('sku')}>
        <Input
          id={id('sku')}
          name="sku"
          defaultValue={offer?.form.sku}
          placeholder="opcional"
        />
      </Field>

      {offer?.inUse ? (
        <p className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          Este e o preco em uso: ao guardar, o custo de todas as fichas que usam
          este insumo e recalculado.
        </p>
      ) : (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="setInUse"
            value="1"
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            Passar a usar este preco
            <span className="block text-xs text-muted-foreground">
              Recalcula o custo de todas as fichas que usam este insumo. Sem isto,
              o preco fica so para comparar.
            </span>
          </span>
        </label>
      )}

      <div className="flex gap-2">
        <SubmitButton size="sm">
          {offer ? 'Guardar preco' : 'Acrescentar preco'}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </ActionForm>
  );
}
