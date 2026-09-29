'use client';

/**
 * Precos de um insumo em cada fornecedor.
 *
 * O preco do insumo — o que alimenta o custo das fichas — fica marcado como
 * "em uso". Os outros sao alternativas para comparar, e adotar um e um clique
 * explicito. Trocar sozinho pelo mais barato faria o custo de todas as fichas
 * mudar porque alguem anotou um preco para consultar.
 */

import { Check, Star, Trash2 } from 'lucide-react';

import { ActionForm, ConfirmDelete, SubmitButton } from '@/components/action-form';
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
import type { ActionState } from '@/components/action-form';
import { useState } from 'react';

export interface OfferRow {
  id: string;
  supplierId: string;
  supplierName: string;
  /** "12,50 € / 5 kg" */
  packLabel: string;
  /** "0,0025 €/g" */
  unitCostLabel: string;
  cheapest: boolean;
  preferred: boolean;
  /** "+19%" quando nao e o mais barato. */
  premiumLabel: string | null;
  /** Este e o preco que o insumo usa hoje. */
  inUse: boolean;
}

export function OffersDialog({
  ingredientId,
  ingredientName,
  baseUnitLabel,
  unitOptions,
  offers,
  suppliers,
  currentLabel,
  saveOffer,
  deleteOffer,
  adoptOffer,
  trigger,
}: {
  ingredientId: string;
  ingredientName: string;
  baseUnitLabel: string;
  unitOptions: Array<{ value: string; label: string }>;
  offers: OfferRow[];
  suppliers: Array<{ id: string; name: string }>;
  /** O preco que o insumo usa hoje, ja formatado. */
  currentLabel: string;
  saveOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  deleteOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  adoptOffer: (s: ActionState, f: FormData) => Promise<ActionState>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Precos de {ingredientName}</DialogTitle>
          <DialogDescription>
            A aplicacao usa hoje <strong>{currentLabel}</strong>. Os precos abaixo
            sao para comparar — adotar um passa a ser o preco do insumo e recalcula
            as fichas que o usam.
          </DialogDescription>
        </DialogHeader>

        {offers.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Ainda nao ha precos de outros fornecedores para comparar.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{o.supplierName}</span>
                    {o.cheapest ? <Badge variant="success">mais barato</Badge> : null}
                    {o.preferred ? (
                      <Badge variant="secondary">
                        <Star className="mr-1 h-3 w-3" aria-hidden />
                        preferido
                      </Badge>
                    ) : null}
                    {o.inUse ? <Badge>em uso</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.packLabel} · {o.unitCostLabel}
                    {o.premiumLabel ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {' '}
                        · {o.premiumLabel} mais caro
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {o.inUse ? null : (
                    <ActionForm action={adoptOffer} showSuccess={false}>
                      <input type="hidden" name="id" value={o.id} />
                      <SubmitButton size="sm" variant="outline" pendingLabel="…">
                        <Check className="h-3.5 w-3.5" />
                        Usar este
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ConfirmDelete
                    action={deleteOffer}
                    fields={{ id: o.id }}
                    title={`Remover o preco de ${o.supplierName}?`}
                    description="O preco do insumo nao muda; so deixa de haver esta alternativa para comparar."
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
        )}

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-3 text-sm font-medium">Acrescentar um preco</p>

          <ActionForm action={saveOffer}>
            <input type="hidden" name="ingredientId" value={ingredientId} />

            <Field label="Fornecedor" htmlFor={`of-sup-${ingredientId}`}>
              <Select id={`of-sup-${ingredientId}`} name="supplierId" required defaultValue="">
                <option value="" disabled>
                  Escolha um fornecedor…
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Preco" htmlFor={`of-price-${ingredientId}`}>
                <Input
                  id={`of-price-${ingredientId}`}
                  name="purchasePrice"
                  inputMode="decimal"
                  placeholder="12,50"
                  required
                />
              </Field>
              <Field label="Quantidade" htmlFor={`of-qty-${ingredientId}`}>
                <Input
                  id={`of-qty-${ingredientId}`}
                  name="purchaseQty"
                  inputMode="decimal"
                  placeholder="5"
                  required
                />
              </Field>
              <Field
                label="Unidade"
                htmlFor={`of-unit-${ingredientId}`}
                hint={`Em ${baseUnitLabel}.`}
              >
                <Select
                  id={`of-unit-${ingredientId}`}
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

            <Field label="Referencia no fornecedor" htmlFor={`of-sku-${ingredientId}`}>
              <Input id={`of-sku-${ingredientId}`} name="sku" placeholder="opcional" />
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="preferred"
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Comprar sempre aqui
                <span className="block text-xs text-muted-foreground">
                  A lista de compras respeita a escolha e diz quanto ela custa em
                  relacao ao mais barato.
                </span>
              </span>
            </label>

            <SubmitButton>Guardar preco</SubmitButton>
          </ActionForm>
        </div>
      </DialogContent>
    </Dialog>
  );
}
