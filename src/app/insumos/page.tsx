import { Package, Trash2 } from 'lucide-react';

import { ActionForm, DeleteButton, SubmitButton } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import { deleteIngredient, saveIngredient } from '@/lib/actions/ingredients';
import { num, toIngredientInput } from '@/lib/mappers';
import { formatMoney, formatPercent, formatUnitCost } from '@/lib/money';
import {
  costPerBaseUnit,
  effectiveCostPerBaseUnit,
  wastePercentFromFc,
} from '@/lib/pricing/cost';
import { getIngredients, getSettings, getSuppliers } from '@/lib/queries';
import { BASE_UNIT_LABEL, UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function InsumosPage() {
  const [rows, suppliers, s] = await Promise.all([
    getIngredients(),
    getSuppliers(),
    getSettings(),
  ]);
  const currency = { currency: s.currency, locale: s.locale };

  const food = rows.filter((r) => r.category === 'FOOD');
  const packaging = rows.filter((r) => r.category === 'PACKAGING');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Insumos e embalagens</h1>
        <p className="text-sm text-muted-foreground">
          A base de todos os custos. O que estiver errado aqui fica errado em todas
          as fichas tecnicas.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <IngredientTable
            title="Insumos alimenticios"
            rows={food}
            currency={currency}
            empty="Nenhum insumo cadastrado."
          />
          <IngredientTable
            title="Embalagens e descartaveis"
            rows={packaging}
            currency={currency}
            empty="Nenhuma embalagem cadastrada. Sem elas o custo do delivery fica subestimado."
          />
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle>Novo insumo</CardTitle>
            <CardDescription>
              Informe o que pagou e o tamanho da embalagem: o custo por grama sai
              sozinho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveIngredient}>
              <Field label="Nome" htmlFor="ing-name">
                <Input
                  id="ing-name"
                  name="name"
                  placeholder="Carne picada 20% gordura"
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoria" htmlFor="ing-category">
                  <Select id="ing-category" name="category" defaultValue="FOOD">
                    <option value="FOOD">Insumo alimenticio</option>
                    <option value="PACKAGING">Embalagem / descartavel</option>
                  </Select>
                </Field>
                <Field label="Fornecedor" htmlFor="ing-supplier">
                  <Select id="ing-supplier" name="supplierId" defaultValue="">
                    <option value="">— sem fornecedor —</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Preco pago" htmlFor="ing-price">
                  <Input
                    id="ing-price"
                    name="purchasePrice"
                    inputMode="decimal"
                    placeholder="12,50"
                    required
                  />
                </Field>
                <Field label="Quantidade" htmlFor="ing-qty">
                  <Input
                    id="ing-qty"
                    name="purchaseQty"
                    inputMode="decimal"
                    placeholder="5"
                    required
                  />
                </Field>
                <Field label="Unidade" htmlFor="ing-unit">
                  <Select id="ing-unit" name="purchaseUnit" defaultValue="KG">
                    <option value="KG">kg</option>
                    <option value="G">g</option>
                    <option value="L">L</option>
                    <option value="ML">ml</option>
                    <option value="UN">unidade</option>
                  </Select>
                </Field>
              </div>

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-medium">Perda na preparacao</p>
                <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                  Limpeza de carne, cascas, aparas. Informe do jeito que for mais
                  natural — os dois dizem a mesma coisa.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Como informar" htmlFor="ing-fcmode">
                    <Select id="ing-fcmode" name="fcMode" defaultValue="WASTE">
                      <option value="WASTE">Percentagem de perda</option>
                      <option value="FC">Fator de correcao (FC)</option>
                    </Select>
                  </Field>
                  <Field label="Perda (%)" htmlFor="ing-waste" hint="0 se nao ha perda.">
                    <Input
                      id="ing-waste"
                      name="wastePercent"
                      inputMode="decimal"
                      defaultValue="0"
                    />
                  </Field>
                </div>

                <Field
                  className="mt-4"
                  label="Fator de correcao"
                  htmlFor="ing-fc"
                  hint="Peso bruto / peso liquido. 1 kg que rende 800 g = 1,25."
                >
                  <Input
                    id="ing-fc"
                    name="correctionFactor"
                    inputMode="decimal"
                    defaultValue="1"
                  />
                </Field>
              </div>

              <Field
                label="Estoque atual"
                htmlFor="ing-stock"
                hint="Na unidade base (g, ml ou un). Usado na lista de compras."
              >
                <Input
                  id="ing-stock"
                  name="stockBase"
                  inputMode="decimal"
                  defaultValue="0"
                />
              </Field>

              <SubmitButton>Guardar insumo</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function IngredientTable({
  title,
  rows,
  currency,
  empty,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getIngredients>>;
  currency: { currency: string; locale: string };
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <Badge variant="secondary">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Compra</TableHead>
                <TableHead className="text-right">Custo base</TableHead>
                <TableHead className="text-right">Perda</TableHead>
                <TableHead className="text-right">Custo real</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const input = toIngredientInput(row);
                const raw = costPerBaseUnit(input);
                const real = effectiveCostPerBaseUnit(input);
                const waste = wastePercentFromFc(input.correctionFactor);
                const unit = BASE_UNIT_LABEL[row.baseUnit];

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      {row.supplier ? (
                        <div className="text-xs text-muted-foreground">
                          {row.supplier.name}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatMoney(num(row.purchasePrice), currency)} /{' '}
                      {num(row.purchaseQty)} {UNIT_LABEL[row.purchaseUnit]}
                    </TableCell>
                    <TableNum className="text-muted-foreground">
                      {formatUnitCost(raw, currency)}/{unit}
                    </TableNum>
                    <TableNum>
                      {waste > 0 ? (
                        <Badge variant="warning">
                          {formatPercent(waste, currency.locale, 0)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableNum>
                    <TableNum className="font-medium">
                      {formatUnitCost(real, currency)}/{unit}
                    </TableNum>
                    <TableCell>
                      <ActionForm action={deleteIngredient} showSuccess={false}>
                        <input type="hidden" name="id" value={row.id} />
                        <DeleteButton confirmMessage={`Remover "${row.name}"?`}>
                          <Trash2 className="h-4 w-4" />
                        </DeleteButton>
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
