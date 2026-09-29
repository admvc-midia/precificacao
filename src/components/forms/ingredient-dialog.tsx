'use client';

/**
 * Editar um insumo: o que ele e, e onde se compra.
 *
 * As duas coisas ficam na mesma janela, uma por baixo da outra. Antes, os
 * precos estavam atras de um icone de loja sem legenda na linha da tabela —
 * quem nao soubesse que existia cadastrava o mesmo item outra vez para
 * registar o segundo fornecedor. Foi o que aconteceu com o acucar.
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
import { Input } from '@/components/ui/input';

export interface PriceRow {
  id: string;
  supplierName: string;
  /** "1,69 € / 1 kg" */
  packLabel: string;
  /** "0,00169 €/g" */
  unitCostLabel: string;
  cheapest: boolean;
  inUse: boolean;
  /** "+41%" quando nao e o mais barato. */
  premiumLabel: string | null;
}

export function IngredientDialog({
  ingredient,
  suppliers,
  unitOptions,
  prices,
  saveIngredient,
  saveOffer,
  deleteOffer,
  setOfferInUse,
  trigger,
}: {
  ingredient: IngredientFormValues;
  suppliers: Array<{ id: string; name: string }>;
  /** Unidades da familia deste insumo. */
  unitOptions: Array<{ value: string; label: string }>;
  prices: PriceRow[];
  saveIngredient: (s: ActionState, f: FormData) => Promise<ActionState>;
  saveOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  deleteOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  setOfferInUse: (s: ActionState, f: FormData) => Promise<ActionState>;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [aAcrescentar, setAAcrescentar] = useState(false);

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
            {aAcrescentar ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAAcrescentar(true)}
              >
                + Acrescentar fornecedor
              </Button>
            )}
          </div>

          <ul className="divide-y rounded-md border">
            {prices.map((p) => (
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
            ))}
          </ul>

          {aAcrescentar ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <ActionForm action={saveOffer}>
                <input type="hidden" name="ingredientId" value={ingredient.id} />

                <Field label="Fornecedor" htmlFor={`np-sup-${ingredient.id}`}>
                  <Select
                    id={`np-sup-${ingredient.id}`}
                    name="supplierId"
                    defaultValue=""
                  >
                    <option value="">— nao registar —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Preco" htmlFor={`np-price-${ingredient.id}`}>
                    <Input
                      id={`np-price-${ingredient.id}`}
                      name="purchasePrice"
                      inputMode="decimal"
                      placeholder="1,20"
                      required
                    />
                  </Field>
                  <Field label="Embalagem" htmlFor={`np-qty-${ingredient.id}`}>
                    <Input
                      id={`np-qty-${ingredient.id}`}
                      name="purchaseQty"
                      inputMode="decimal"
                      placeholder="1"
                      required
                    />
                  </Field>
                  <Field label="Unidade" htmlFor={`np-unit-${ingredient.id}`}>
                    <Select
                      id={`np-unit-${ingredient.id}`}
                      name="purchaseUnit"
                      defaultValue={unitOptions[0]?.value}
                    >
                      {unitOptions.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field
                  label="Referencia no fornecedor"
                  htmlFor={`np-sku-${ingredient.id}`}
                >
                  <Input
                    id={`np-sku-${ingredient.id}`}
                    name="sku"
                    placeholder="opcional"
                  />
                </Field>

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
                      Recalcula o custo de todas as fichas que usam este insumo. Sem
                      isto, o preco fica so para comparar.
                    </span>
                  </span>
                </label>

                <div className="flex gap-2">
                  <SubmitButton size="sm">Guardar preco</SubmitButton>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAAcrescentar(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </ActionForm>
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
