import Link from 'next/link';
import { ArrowRight, ChefHat, Layers } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { Alert, Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import { saveRecipe } from '@/lib/actions/recipes';
import { formatMoney, formatUnitCost } from '@/lib/money';
import { getCostedRecipes, getIngredients } from '@/lib/queries';
import { BASE_UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function FichasPage() {
  const [{ recipes, currency }, ingredients] = await Promise.all([
    getCostedRecipes(),
    getIngredients(),
  ]);

  const packaging = ingredients.filter((i) => i.category === 'PACKAGING');
  const bases = recipes.filter((r) => r.kind === 'BASE');
  const products = recipes.filter((r) => r.kind === 'PRODUCT');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fichas tecnicas</h1>
        <p className="text-sm text-muted-foreground">
          Preparacoes base entram como ingrediente dos produtos finais. O custo
          desce a arvore sozinho.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <RecipeTable
            icon={<ChefHat className="h-4 w-4 text-muted-foreground" />}
            title="Produtos finais"
            rows={products}
            currency={currency}
            empty="Nenhum produto cadastrado."
          />
          <RecipeTable
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            title="Preparacoes base"
            rows={bases}
            currency={currency}
            empty="Nenhuma preparacao base. Crie uma para molhos, massas ou maioneses que entram em varios produtos."
            perUnit
          />
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle>Nova ficha</CardTitle>
            <CardDescription>
              Crie a ficha e depois adicione os ingredientes dentro dela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveRecipe}>
              <Field label="Nome" htmlFor="rec-name">
                <Input
                  id="rec-name"
                  name="name"
                  placeholder="Hamburguer da Casa"
                  required
                />
              </Field>

              <Field
                label="Tipo"
                htmlFor="rec-kind"
                hint="Produto final e o que se vende. Base e o que entra noutras fichas."
              >
                <Select id="rec-kind" name="kind" defaultValue="PRODUCT">
                  <option value="PRODUCT">Produto final</option>
                  <option value="BASE">Preparacao base</option>
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Rendimento"
                  htmlFor="rec-yield"
                  hint="Produto: porcoes por lote. Base: total do lote."
                >
                  <Input
                    id="rec-yield"
                    name="yieldQty"
                    inputMode="decimal"
                    defaultValue="1"
                    required
                  />
                </Field>
                <Field
                  label="Unidade do rendimento"
                  htmlFor="rec-yield-unit"
                  hint="Ignorado nos produtos finais (sempre porcoes)."
                >
                  <Select id="rec-yield-unit" name="yieldUnit" defaultValue="G">
                    <option value="G">gramas</option>
                    <option value="ML">mililitros</option>
                    <option value="UN">unidades</option>
                  </Select>
                </Field>
              </div>

              <Field
                label="Embalagem principal"
                htmlFor="rec-pack"
                hint="Cobrada uma por porcao, em todos os canais."
              >
                <Select id="rec-pack" name="packagingId" defaultValue="">
                  <option value="">— sem embalagem —</option>
                  {packaging.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Embalagem de transporte"
                htmlFor="rec-dpack"
                hint="Cobrada so nos canais de entrega."
              >
                <Select id="rec-dpack" name="deliveryPackagingId" defaultValue="">
                  <option value="">— nenhuma —</option>
                  {packaging.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Descricao" htmlFor="rec-desc">
                <Textarea id="rec-desc" name="description" />
              </Field>

              {packaging.length === 0 ? (
                <Alert tone="info">
                  Ainda nao ha embalagens cadastradas. Crie-as em Insumos com a
                  categoria &quot;Embalagem&quot; para que entrem no custo.
                </Alert>
              ) : null}

              <SubmitButton>Criar ficha</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecipeTable({
  icon,
  title,
  rows,
  currency,
  empty,
  perUnit = false,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Awaited<ReturnType<typeof getCostedRecipes>>['recipes'];
  currency: { currency: string; locale: string };
  empty: string;
  perUnit?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          {icon}
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
                <TableHead>Ficha</TableHead>
                <TableHead className="text-right">Rendimento</TableHead>
                <TableHead className="text-right">
                  {perUnit ? 'Custo por unidade' : 'Custo primo'}
                </TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/fichas/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {r.error ? (
                      <div className="mt-0.5 text-xs text-destructive">{r.error}</div>
                    ) : null}
                  </TableCell>
                  <TableNum className="text-muted-foreground">
                    {r.cost
                      ? `${r.cost.yieldQty} ${BASE_UNIT_LABEL[r.cost.yieldUnit]}`
                      : '—'}
                  </TableNum>
                  <TableNum className="font-medium">
                    {r.cost
                      ? perUnit
                        ? `${formatUnitCost(
                            r.cost.foodCostPerUnit,
                            currency,
                          )}/${BASE_UNIT_LABEL[r.cost.yieldUnit]}`
                        : formatMoney(r.cost.primeCost, currency)
                      : '—'}
                  </TableNum>
                  <TableCell className="text-right">
                    <Link
                      href={perUnit ? `/fichas/${r.id}` : `/precificacao/${r.id}`}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {perUnit ? 'Abrir' : 'Precificar'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
