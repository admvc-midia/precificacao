import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { GroupedList, type ListColumn, type ListRow } from '@/components/data-list';
import { RecipeFields } from '@/components/forms/fields';
import { Alert } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deleteRecipe, saveRecipe } from '@/lib/actions/recipes';
import { formatMoney } from '@/lib/money';
import { getCostedRecipes, getIngredients } from '@/lib/queries';
import { formatBaseQty, formatCostPerUnit } from '@/lib/units';

export const dynamic = 'force-dynamic';

type Costed = Awaited<ReturnType<typeof getCostedRecipes>>['recipes'][number];

export default async function FichasPage() {
  const [{ recipes, currency }, ingredients] = await Promise.all([
    getCostedRecipes(),
    getIngredients(),
  ]);

  const packaging = ingredients.filter((i) => i.category === 'PACKAGING');

  const build = (r: Costed, perUnit: boolean): ListRow => {
    const rendimento = r.cost
      ? formatBaseQty(r.cost.yieldQty, r.cost.yieldUnit, currency.locale)
      : '—';

    const custo = r.cost
      ? perUnit
        ? formatCostPerUnit(r.cost.foodCostPerUnit, r.cost.yieldUnit, currency)
        : formatMoney(r.cost.productCost, currency)
      : '—';

    return {
      id: r.id,
      search: r.name,
      cells: [
        <Link key="n" href={`/fichas/${r.id}`} className="font-medium hover:underline">
          {r.name}
        </Link>,
        <span key="y" className="text-muted-foreground">
          {rendimento}
        </span>,
        <span key="c" className="font-medium">
          {custo}
        </span>,
      ],
      title: (
        <Link href={`/fichas/${r.id}`} className="hover:underline">
          {r.name}
        </Link>
      ),
      lead: <span className="font-medium">{custo}</span>,
      meta: <>rende {rendimento}</>,
      note: r.error,
      actions: (
        <>
          <Link
            href={perUnit ? `/fichas/${r.id}` : `/precificacao/${r.id}`}
            className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-1.5 text-sm text-primary hover:underline"
          >
            {perUnit ? 'Abrir' : 'Precificar'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <ConfirmDelete
            action={deleteRecipe}
            fields={{ id: r.id }}
            title={`Remover "${r.name}"?`}
            description="A ficha e a sua composicao sao apagadas. Os insumos nao sao afetados."
          />
        </>
      ),
    };
  };

  const products = recipes
    .filter((r) => r.kind === 'PRODUCT')
    .map((r) => build(r, false));
  const bases = recipes.filter((r) => r.kind === 'BASE').map((r) => build(r, true));

  const colunas = (custoLabel: string): ListColumn[] => [
    { header: 'Ficha' },
    { header: 'Rendimento', align: 'right', hideBelow: 'lg' },
    { header: custoLabel, align: 'right' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fichas tecnicas
            <AjudaLink secao="fichas" />
          </h1>
        <p className="text-sm text-muted-foreground">
          Preparacoes base entram como ingrediente dos produtos finais. O custo
          desce a arvore sozinho.
        </p>
      </header>

      {packaging.length === 0 ? (
        <Alert tone="info">
          Ainda nao ha embalagens cadastradas. Crie-as em{' '}
          <Link href="/insumos" className="underline">
            Insumos
          </Link>{' '}
          com a categoria &quot;Embalagem&quot; para que entrem no custo.
        </Alert>
      ) : null}

      <GroupedList
        storageKey="fichas"
        searchPlaceholder="Procurar ficha…"
        toolbar={<NovaFicha packaging={packaging} />}
        groups={[
          {
            id: 'products',
            title: 'Produtos finais',
            columns: colunas('Custo do produto'),
            rows: products,
            empty: 'Nenhum produto cadastrado.',
          },
          {
            id: 'bases',
            title: 'Preparacoes base',
            columns: colunas('Custo por unidade'),
            rows: bases,
            empty:
              'Nenhuma preparacao base. Crie uma para molhos, massas ou maioneses que entram em varios produtos.',
          },
        ]}
      />
    </div>
  );
}

function NovaFicha({ packaging }: { packaging: Array<{ id: string; name: string }> }) {
  return (
    <FormDialog
      action={saveRecipe}
      title="Nova ficha tecnica"
      description="Crie a ficha e depois adicione os ingredientes dentro dela."
      submitLabel="Criar ficha"
      trigger={
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Nova ficha
        </Button>
      }
    >
      <RecipeFields packaging={packaging} idPrefix="nova" />
    </FormDialog>
  );
}
