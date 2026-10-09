'use client';

/**
 * Os campos de uma promocao que dependem do tipo: percentagem, valor por
 * unidade, leve X pague Y, preco a partir de N. Os outros nao se mostram
 * (e a action ignora-os), para nao ficar a duvida de qual conta.
 */

import { useState } from 'react';

import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { PROMOCAO_LABEL, type PromotionKind } from '@/lib/pricing/cardapio';

export function CamposPromocao({
  inicial,
}: {
  inicial?: {
    kind: PromotionKind;
    value: string;
    buyQty: string;
    payQty: string;
    minQty: string;
  };
}) {
  const [kind, setKind] = useState<PromotionKind>(inicial?.kind ?? 'PERCENT');
  return (
    <>
      <Field label="Tipo" htmlFor="pr-tipo">
        <Select id="pr-tipo" name="kind" value={kind} onChange={(e) => setKind(e.target.value as PromotionKind)}>
          {(Object.keys(PROMOCAO_LABEL) as PromotionKind[]).map((k) => (
            <option key={k} value={k}>
              {PROMOCAO_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>
      {kind === 'PERCENT' ? (
        <Field label="Desconto (%)" htmlFor="pr-valor" hint="15 = 15% em cada unidade.">
          <Input id="pr-valor" name="value" inputMode="decimal" defaultValue={inicial?.kind === 'PERCENT' ? inicial.value : ''} required />
        </Field>
      ) : null}
      {kind === 'AMOUNT' ? (
        <Field label="Desconto por unidade" htmlFor="pr-valor" hint="0,50 = cada unidade fica 0,50 mais barata.">
          <Input id="pr-valor" name="value" inputMode="decimal" defaultValue={inicial?.kind === 'AMOUNT' ? inicial.value : ''} required />
        </Field>
      ) : null}
      {kind === 'BUY_X_PAY_Y' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Leve" htmlFor="pr-leve">
            <Input id="pr-leve" name="buyQty" inputMode="numeric" defaultValue={inicial?.buyQty ?? ''} placeholder="12" required />
          </Field>
          <Field label="Pague" htmlFor="pr-pague" hint="Conta por lotes: 25 = 2 lotes + 1.">
            <Input id="pr-pague" name="payQty" inputMode="numeric" defaultValue={inicial?.payQty ?? ''} placeholder="10" required />
          </Field>
        </div>
      ) : null}
      {kind === 'QTY_PRICE' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="A partir de" htmlFor="pr-min" hint="unidades">
            <Input id="pr-min" name="minQty" inputMode="decimal" defaultValue={inicial?.minQty ?? ''} placeholder="50" required />
          </Field>
          <Field label="Preço de cada" htmlFor="pr-valor">
            <Input id="pr-valor" name="value" inputMode="decimal" defaultValue={inicial?.kind === 'QTY_PRICE' ? inicial.value : ''} required />
          </Field>
        </div>
      ) : null}
    </>
  );
}
