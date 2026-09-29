import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { Alert, Badge, Separator } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { saveIngredient } from '@/lib/actions/ingredients';
import {
  addRecipeItem,
  deleteRecipeItem,
  saveRecipe,
  updateRecipeItem,
} from '@/lib/actions/recipes';
import { CompositionTable } from '@/components/composition-table';
import { QtyInput } from '@/components/ui/qty-input';
import { RecipeFields } from '@/components/forms/fields';
import { IngredientForm } from '@/components/forms/ingredient-form';
import { RecipeItemForm } from '@/components/forms/recipe-item-form';
import { buildCostContext } from '@/lib/mappers';
import { formatMoney } from '@/lib/money';
import { computeRecipeCost } from '@/lib/pricing/cost';
import type { RecipeCost } from '@/lib/pricing/types';
import { getPricingData, getRecipeDetail, getSuppliers } from '@/lib/queries';
import {
  baseUnitOf,
  displayQtyValue,
  displayUnitOf,
  DISPLAY_UNIT_LABEL,
  formatBaseQty,
  formatCostPerUnit,
  toBase,
} from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, data, suppliers] = await Promise.all([
    getRecipeDetail(id),
    getPricingData(),
    getSuppliers(),
  ]);
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
  const yieldLabel = DISPLAY_UNIT_LABEL[recipe.yieldUnit];

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
          Rende {formatBaseQty(Number(recipe.yieldQty), recipe.yieldUnit, currency.locale)}
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
              <CompositionTable
                rows={recipe.items.map((item, index) => {
                  // As linhas de custo seguem a mesma ordem dos itens.
                  const line = cost?.lines[index];
                  const nome = item.ingredient?.name ?? item.childRecipe?.name ?? '—';
                  const base = item.ingredient
                    ? baseUnitOf(item.ingredient.purchaseUnit)
                    : (item.childRecipe?.yieldUnit ?? 'UN');

                  return {
                    id: item.id,
                    name: (
                      <span>
                        <span className="font-medium">{nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.childRecipeId ? 'Preparacao base' : 'Insumo'}
                          {line && line.correctionFactor > 1
                            ? ` · FC ${line.correctionFactor.toFixed(2)}`
                            : ''}
                        </span>
                      </span>
                    ),
                    qty: formatBaseQty(
                      line ? line.qtyBase : toBase(Number(item.qty), item.unit),
                      base,
                      currency.locale,
                    ),
                    unitCost: line
                      ? formatCostPerUnit(line.unitCost, base, currency)
                      : '—',
                    cost: line ? formatMoney(line.cost, currency) : '—',
                    actions: (
                      <>
                        <FormDialog
                          action={updateRecipeItem}
                          title={`Alterar ${nome}`}
                          description={`Quantidade usada no lote inteiro desta ficha, nao na porcao (o lote rende ${formatBaseQty(Number(recipe.yieldQty), recipe.yieldUnit, currency.locale)}).`}
                          submitLabel="Guardar"
                        >
                          <input type="hidden" name="id" value={item.id} />
                          <Field label="Quantidade" htmlFor={`q-${item.id}`}>
                            <QtyInput
                              id={`q-${item.id}`}
                              name="qty"
                              unitLabel={DISPLAY_UNIT_LABEL[base]}
                              unitName="unit"
                              unitValue={displayUnitOf(base)}
                              defaultValue={displayQtyValue(
                                toBase(Number(item.qty), item.unit),
                                base,
                              )}
                              required
                            />
                          </Field>
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
                          title={`Remover "${nome}" da ficha?`}
                          description="O custo da ficha e recalculado sem este item."
                        />
                      </>
                    ),
                  };
                })}
                total={
                  cost
                    ? {
                        label: 'Custo do lote',
                        value: formatMoney(cost.batchFoodCost, currency),
                      }
                    : undefined
                }
              />
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
                      : formatCostPerUnit(cost.foodCostPerUnit, recipe.yieldUnit, currency)
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
                Insumo ou outra preparacao base. Se o que procura ainda nao
                existe, crie-o aqui mesmo.
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

              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Nao encontrou o insumo na lista?
                </p>
                <FormDialog
                  action={saveIngredient}
                  title="Novo insumo"
                  description="Depois de guardar, ele aparece no seletor acima para ser adicionado a esta ficha."
                  submitLabel="Guardar insumo"
                  trigger={
                    <Button variant="outline" className="w-full">
                      <Plus className="h-4 w-4" />
                      Criar insumo sem sair daqui
                    </Button>
                  }
                >
                  <IngredientForm
                    suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                    idPrefix={`ficha-${id}`}
                  />
                </FormDialog>
              </div>
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
