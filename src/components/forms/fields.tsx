/**
 * Campos de formulario partilhados entre criar e editar.
 *
 * Nao sao componentes de cliente: sao JSX simples com `defaultValue`, por isso
 * o servidor renderiza-os e passa-os como filhos ao `FormDialog`, que e o
 * unico que precisa de estado. Assim o mesmo formulario serve a pagina e a
 * janela sem duplicar campo nenhum.
 *
 * Cada um recebe `idPrefix` porque a mesma pagina mostra o formulario de
 * criar e um de editar por linha — sem prefixo os `id`/`htmlFor` repetiam-se
 * e o clique no rotulo focava o campo errado.
 */

import { WasteInput } from '@/components/forms/waste-input';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { num } from '@/lib/mappers';

/** Numero para `defaultValue`, sem casas decimais a mais. */
function dec(value: unknown): string {
  const n = num(value);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '';
}

/** Fracao guardada (0.3) para percentagem no ecra ("30"). */
function pct(value: unknown): string {
  const n = num(value) * 100;
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '';
}

// ---------------------------------------------------------------------------
// Insumo / embalagem
// ---------------------------------------------------------------------------

export interface IngredientFormValues {
  id: string;
  name: string;
  category: 'FOOD' | 'PACKAGING';
  supplierId: string | null;
  purchasePrice: unknown;
  purchaseQty: unknown;
  purchaseUnit: 'KG' | 'G' | 'L' | 'ML' | 'UN';
  correctionFactor: unknown;
  stockBase: unknown;
  notes: string | null;
}

export function IngredientFields({
  ingredient,
  suppliers,
  idPrefix,
  defaultCategory = 'FOOD',
}: {
  ingredient?: IngredientFormValues;
  suppliers: Array<{ id: string; name: string }>;
  idPrefix: string;
  defaultCategory?: 'FOOD' | 'PACKAGING';
}) {
  const id = (n: string) => `${idPrefix}-${n}`;

  return (
    <>
      {ingredient ? <input type="hidden" name="id" value={ingredient.id} /> : null}

      <Field label="Nome" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          defaultValue={ingredient?.name ?? ''}
          placeholder="Carne picada 20% gordura"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor={id('category')}>
          <Select
            id={id('category')}
            name="category"
            defaultValue={ingredient?.category ?? defaultCategory}
          >
            <option value="FOOD">Insumo alimenticio</option>
            <option value="PACKAGING">Embalagem / descartavel</option>
          </Select>
        </Field>
        <Field label="Fornecedor" htmlFor={id('supplier')}>
          <Select
            id={id('supplier')}
            name="supplierId"
            defaultValue={ingredient?.supplierId ?? ''}
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
            defaultValue={ingredient ? dec(ingredient.purchasePrice) : ''}
            placeholder="12,50"
            required
          />
        </Field>
        <Field label="Quantidade" htmlFor={id('qty')}>
          <Input
            id={id('qty')}
            name="purchaseQty"
            inputMode="decimal"
            defaultValue={ingredient ? dec(ingredient.purchaseQty) : ''}
            placeholder="5"
            required
          />
        </Field>
        <Field label="Unidade" htmlFor={id('unit')}>
          <Select
            id={id('unit')}
            name="purchaseUnit"
            defaultValue={ingredient?.purchaseUnit ?? 'KG'}
          >
            <option value="KG">kg</option>
            <option value="G">g</option>
            <option value="L">L</option>
            <option value="ML">ml</option>
            <option value="UN">unidade</option>
          </Select>
        </Field>
      </div>

      <WasteInput
        idPrefix={idPrefix}
        defaultFc={ingredient ? num(ingredient.correctionFactor) : 1}
      />

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
            defaultValue={ingredient ? dec(ingredient.stockBase) : '0'}
          />
        </Field>
        <Field label="Notas" htmlFor={id('notes')}>
          <Input id={id('notes')} name="notes" defaultValue={ingredient?.notes ?? ''} />
        </Field>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fornecedor
// ---------------------------------------------------------------------------

export interface SupplierFormValues {
  id: string;
  name: string;
  url: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
}

export function SupplierFields({
  supplier,
  idPrefix,
}: {
  supplier?: SupplierFormValues;
  idPrefix: string;
}) {
  const id = (n: string) => `${idPrefix}-${n}`;

  return (
    <>
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}

      <Field label="Nome" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          defaultValue={supplier?.name ?? ''}
          placeholder="Continente"
          required
        />
      </Field>

      <Field
        label="Morada"
        htmlFor={id('address')}
        hint="Onde ir buscar. Aparece na lista de compras."
      >
        <Input
          id={id('address')}
          name="address"
          defaultValue={supplier?.address ?? ''}
          placeholder="Rua da Republica 120, Cascais"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone" htmlFor={id('phone')}>
          <Input
            id={id('phone')}
            name="phone"
            type="tel"
            defaultValue={supplier?.phone ?? ''}
            placeholder="+351 210 000 000"
          />
        </Field>
        <Field label="Site ou loja online" htmlFor={id('url')}>
          <Input
            id={id('url')}
            name="url"
            type="url"
            defaultValue={supplier?.url ?? ''}
            placeholder="https://"
          />
        </Field>
      </div>

      <Field label="Notas" htmlFor={id('notes')}>
        <Textarea
          id={id('notes')}
          name="notes"
          defaultValue={supplier?.notes ?? ''}
          placeholder="Entrega as tercas. Pedido minimo 50 EUR."
        />
      </Field>
    </>
  );
}

// ---------------------------------------------------------------------------
// Canal de venda
// ---------------------------------------------------------------------------

export interface ChannelFormValues {
  id: string;
  name: string;
  kind: 'COUNTER' | 'OWN_DELIVERY' | 'PLATFORM';
  commissionRate: unknown;
  deliveryCost: unknown;
  cardFeeRate: unknown;
  usesDeliveryPackaging: boolean;
  active: boolean;
}

export function ChannelFields({
  channel,
  idPrefix,
}: {
  channel?: ChannelFormValues;
  idPrefix: string;
}) {
  const id = (n: string) => `${idPrefix}-${n}`;

  return (
    <>
      {channel ? <input type="hidden" name="id" value={channel.id} /> : null}
      {/* Diz a action que o checkbox "ativo" esteve no formulario. Ver o
          comentario em saveChannel. */}
      <input type="hidden" name="activeSubmitted" value="1" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={id('name')}>
          <Input
            id={id('name')}
            name="name"
            defaultValue={channel?.name ?? ''}
            placeholder="Uber Eats"
            required
          />
        </Field>
        <Field label="Tipo" htmlFor={id('kind')}>
          <Select id={id('kind')} name="kind" defaultValue={channel?.kind ?? 'PLATFORM'}>
            <option value="COUNTER">Balcao / consumo local</option>
            <option value="OWN_DELIVERY">Entrega propria</option>
            <option value="PLATFORM">Plataforma de delivery</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Comissao (%)" htmlFor={id('commission')}>
          <Input
            id={id('commission')}
            name="commissionRate"
            inputMode="decimal"
            defaultValue={channel ? pct(channel.commissionRate) : '0'}
          />
        </Field>
        <Field label="Frete por pedido" htmlFor={id('delivery')}>
          <Input
            id={id('delivery')}
            name="deliveryCost"
            inputMode="decimal"
            defaultValue={channel ? dec(channel.deliveryCost) : '0'}
          />
        </Field>
        <Field
          label="Cartao (%)"
          htmlFor={id('card')}
          hint="Vazio = usa a taxa global."
        >
          <Input
            id={id('card')}
            name="cardFeeRate"
            inputMode="decimal"
            defaultValue={
              channel && channel.cardFeeRate !== null ? pct(channel.cardFeeRate) : ''
            }
          />
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="usesDeliveryPackaging"
            defaultChecked={channel?.usesDeliveryPackaging ?? false}
            className="h-4 w-4 rounded border-input"
          />
          Cobra a embalagem extra de transporte
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={channel?.active ?? true}
            className="h-4 w-4 rounded border-input"
          />
          Canal ativo
        </label>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ficha tecnica
// ---------------------------------------------------------------------------

export interface RecipeFormValues {
  id: string;
  name: string;
  kind: 'BASE' | 'PRODUCT';
  description: string | null;
  yieldQty: unknown;
  yieldUnit: 'G' | 'ML' | 'UN';
  packagingId: string | null;
  deliveryPackagingId: string | null;
}

export function RecipeFields({
  recipe,
  packaging,
  idPrefix,
}: {
  recipe?: RecipeFormValues;
  packaging: Array<{ id: string; name: string }>;
  idPrefix: string;
}) {
  const id = (n: string) => `${idPrefix}-${n}`;

  return (
    <>
      {recipe ? <input type="hidden" name="id" value={recipe.id} /> : null}

      <Field label="Nome" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          defaultValue={recipe?.name ?? ''}
          placeholder="Hamburguer da Casa"
          required
        />
      </Field>

      <Field
        label="Tipo"
        htmlFor={id('kind')}
        hint="Produto final e o que se vende. Base e o que entra noutras fichas."
      >
        <Select id={id('kind')} name="kind" defaultValue={recipe?.kind ?? 'PRODUCT'}>
          <option value="PRODUCT">Produto final</option>
          <option value="BASE">Preparacao base</option>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Rendimento"
          htmlFor={id('yield')}
          hint="Produto: porcoes por lote. Base: total do lote."
        >
          <Input
            id={id('yield')}
            name="yieldQty"
            inputMode="decimal"
            defaultValue={recipe ? dec(recipe.yieldQty) : '1'}
            required
          />
        </Field>
        <Field
          label="Unidade do rendimento"
          htmlFor={id('yieldUnit')}
          hint="Ignorado nos produtos finais (sempre porcoes)."
        >
          <Select
            id={id('yieldUnit')}
            name="yieldUnit"
            defaultValue={recipe?.yieldUnit ?? 'G'}
          >
            <option value="G">gramas</option>
            <option value="ML">mililitros</option>
            <option value="UN">unidades</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Embalagem principal"
        htmlFor={id('pack')}
        hint="Cobrada uma por porcao, em todos os canais."
      >
        <Select
          id={id('pack')}
          name="packagingId"
          defaultValue={recipe?.packagingId ?? ''}
        >
          <option value="">— sem embalagem —</option>
          {packaging.map((pk) => (
            <option key={pk.id} value={pk.id}>
              {pk.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Embalagem de transporte"
        htmlFor={id('dpack')}
        hint="Cobrada so nos canais de entrega."
      >
        <Select
          id={id('dpack')}
          name="deliveryPackagingId"
          defaultValue={recipe?.deliveryPackagingId ?? ''}
        >
          <option value="">— nenhuma —</option>
          {packaging.map((pk) => (
            <option key={pk.id} value={pk.id}>
              {pk.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Descricao" htmlFor={id('desc')}>
        <Textarea
          id={id('desc')}
          name="description"
          defaultValue={recipe?.description ?? ''}
        />
      </Field>
    </>
  );
}
