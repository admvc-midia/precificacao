import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { Alert, Badge, Separator } from '@/components/ui/badge';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import {
  addRecipeItem,
  deleteRecipeItem,
  saveRecipe,
  updateRecipeItem,
} from '@/lib/actions/recipes';
import { RecipeFields } from '@/components/forms/fields';
import { RecipeItemForm } from '@/components/forms/recipe-item-form';
import { buildCostContext } from '@/lib/mappers';
import { formatMoney, formatUnitCost } from '@/lib/money';
import { computeRecipeCost } from '@/lib/pricing/cost';
import type { RecipeCost } from '@/lib/pricing/types';
import { getPricingData, getRecipeDetail } from '@/lib/queries';
import { BASE_UNIT_LABEL, UNIT_LABEL, baseUnitOf } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, data] = await Promise.all([getRecipeDetail(id), getPricingData()]);
  if (!recipe) notFound();

  const ctx = buildCostContext(data.ingredientRows, data.recipeRows);
  const currency = data.currency;

  let cost: RecipeCost | null = null;
  let error: string | null = null;
  try {
    cost = computeRecipeCost(id, ctx);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const isProduct = recipe.kind === 'PRODUCT';
  const yieldLabel = BASE_UNIT_LABEL[recipe.yieldUnit];

  // Opcoes do seletor: insumos alimenticios + outras fichas (nunca esta).
  const foodOptions = data.ingredientRows.filter((i) => i.category === 'FOOD');
  const packagingOptions = data.ingredientRows.filter(
    (i) => i.category === 'PACKAGING',
  );
  const recipeOptions = data.recipeRows.filter((r) => r.id !== id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/fichas" className="text-sm text-muted-foreground hover:underline">
            Fichas tecnicas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          <Badge variant={isProduct ? 'default' : 'secondary'}>
            {isProduct ? 'Produto final' : 'Preparacao base'}
          </Badge>

          <FormDialog
            action={saveRecipe}
            title={`Editar ${recipe.name}`}
            description="Nome, rendimento e embalagens. A composicao edita-se na tabela abaixo."
            submitLabel="Guardar alteracoes"
          >
            <RecipeFields
              recipe={recipe}
              packaging={packagingOptions}
              idPrefix={`rec-${recipe.id}`}
            />
          </FormDialog>
        </div>
        <p className="text-sm text-muted-foreground">
          Rende {Number(recipe.yieldQty)} {yieldLabel}
          {recipe.description ? ` · ${recipe.description}` : ''}
        </p>
      </header>

      {error ? <Alert tone="destructive">{error}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Composicao</CardTitle>
            <CardDescription>
              Quantidades do lote inteiro, nao da porcao.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recipe.items.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Ficha vazia. Adicione o primeiro ingrediente ao lado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Custo unitario</TableHead>
                    <TableHead className="text-right">Custo no lote</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipe.items.map((item, index) => {
                    // As linhas de custo sao construidas a partir de
                    // recipe.items na mesma ordem (sortOrder), entao a
                    // correspondencia e posicional. Procurar por refId daria
                    // a linha errada quando o mesmo insumo aparece duas vezes
                    // na ficha.
                    const line = cost?.lines[index];
                    const name =
                      item.ingredient?.name ?? item.childRecipe?.name ?? '—';
                    const base = item.ingredient
                      ? baseUnitOf(item.ingredient.purchaseUnit)
                      : (item.childRecipe?.yieldUnit ?? 'UN');

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.childRecipeId ? 'Preparacao base' : 'Insumo'}
                            {line && line.correctionFactor > 1
                              ? ` · FC ${line.correctionFactor.toFixed(2)}`
                              : ''}
                          </div>
                        </TableCell>
                        <TableNum className="text-muted-foreground">
                          {Number(item.qty)} {UNIT_LABEL[item.unit]}
                        </TableNum>
                        <TableNum className="text-muted-foreground">
                          {line
                            ? `${formatUnitCost(line.unitCost, currency)}/${BASE_UNIT_LABEL[base]}`
                            : '—'}
                        </TableNum>
                        <TableNum className="font-medium">
                          {line ? formatMoney(line.cost, currency) : '—'}
                        </TableNum>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <FormDialog
                              action={updateRecipeItem}
                              title={`Alterar ${name}`}
                              description={`Quantidade usada no lote inteiro desta ficha (rende ${Number(recipe.yieldQty)} ${yieldLabel}).`}
                              submitLabel="Guardar"
                            >
                              <input type="hidden" name="id" value={item.id} />
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Quantidade" htmlFor={`q-${item.id}`}>
                                  <Input
                                    id={`q-${item.id}`}
                                    name="qty"
                                    inputMode="decimal"
                                    defaultValue={String(Number(item.qty))}
                                    required
                                  />
                                </Field>
                                <Field
                                  label="Unidade"
                                  htmlFor={`u-${item.id}`}
                                  hint="Tem de ser da mesma familia do item."
                                >
                                  <Select
                                    id={`u-${item.id}`}
                                    name="unit"
                                    defaultValue={item.unit}
                                  >
                                    {(['G', 'KG', 'ML', 'L', 'UN'] as const).map((u) => (
                                      <option key={u} value={u}>
                                        {UNIT_LABEL[u]}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                              <Field label="Notas" htmlFor={`n-${item.id}`}>
                                <Input
                                  id={`n-${item.id}`}
                                  name="notes"
                                  defaultValue={item.notes ?? ''}
                                />
                              </Field>
                            </FormDialog>

                            <ConfirmDelete
                              action={deleteRecipeItem}
                              fields={{ id: item.id, recipeId: id }}
                              title={`Remover "${name}" da ficha?`}
                              description="O custo da ficha e recalculado sem este item."
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {cost ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>Custo do lote</TableCell>
                      <TableNum>{formatMoney(cost.batchFoodCost, currency)}</TableNum>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {cost ? (
            <Card>
              <CardHeader>
                <CardTitle>Custo apurado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label={isProduct ? 'Alimento por porcao' : `Custo por ${yieldLabel}`}
                  value={
                    isProduct
                      ? formatMoney(cost.foodCostPerUnit, currency)
                      : `${formatUnitCost(cost.foodCostPerUnit, currency)}/${yieldLabel}`
                  }
                />
                {isProduct ? (
                  <>
                    <Row
                      label="Embalagem principal"
                      value={formatMoney(cost.packagingCost, currency)}
                      muted={cost.packagingCost === 0}
                    />
                    <Row
                      label="Embalagem de transporte"
                      value={formatMoney(cost.deliveryPackagingCost, currency)}
                      muted={cost.deliveryPackagingCost === 0}
                      hint="So nos canais de entrega"
                    />
                    <Separator className="my-2" />
                    <Row
                      label="Custo do produto (balcao)"
                      value={formatMoney(cost.productCost, currency)}
                      strong
                    />
                    <Link
                      href={`/precificacao/${id}`}
                      className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Calcular o preco de venda
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                ) : (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Preparacoes base nao tem preco proprio: o custo entra nas fichas
                    que as utilizam.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Adicionar item</CardTitle>
              <CardDescription>
                Insumo ou outra preparacao base.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={addRecipeItem}>
                <RecipeItemForm
                  recipeId={id}
                  options={[
                    ...foodOptions.map((i) => ({
                      value: `ING:${i.id}`,
                      label: i.name,
                      baseUnit: i.baseUnit,
                      group: 'Insumos' as const,
                    })),
                    ...recipeOptions.map((r) => ({
                      value: `REC:${r.id}`,
                      label: r.name,
                      baseUnit: r.yieldUnit,
                      group: 'Preparacoes base' as const,
                    })),
                  ]}
                />
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  strong,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? 'text-muted-foreground' : ''}>
        {label}
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <span
        className={`tabular-nums ${strong ? 'text-base font-semibold' : ''} ${
          muted ? 'text-muted-foreground' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
