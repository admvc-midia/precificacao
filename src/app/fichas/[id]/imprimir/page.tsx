/**
 * A ficha tecnica em papel, para afixar na cozinha.
 *
 * ---------------------------------------------------------------------------
 * PORQUE E UMA ROTA E NAO UM `@media print` NA PAGINA DE EDICAO
 * ---------------------------------------------------------------------------
 * A pagina de edicao tem botoes, janelas, campos e uma barra de navegacao.
 * Esconder tudo isso com CSS de impressao da uma folha cheia de buracos onde
 * os elementos estavam, e obriga a manter duas leituras do mesmo markup — uma
 * para o ecra e outra para o papel — que divergem a primeira alteracao.
 *
 * Uma rota separada tem so o que vai para o papel. Abre-se, imprime-se, e
 * quem quiser PDF usa "Guardar como PDF" no dialogo do sistema, que e o que
 * toda a gente ja sabe fazer e nao pede biblioteca nenhuma.
 *
 * ---------------------------------------------------------------------------
 * O QUE VAI E O QUE NAO VAI
 * ---------------------------------------------------------------------------
 * Vai o que a cozinha precisa: o que leva, quanto leva, quanto rende, e os
 * alergenios. **Custos nao vao.** Uma ficha afixada na parede e lida por
 * quem passa, incluindo fornecedores e clientes, e as margens da casa nao sao
 * assunto deles. Quem quiser os custos tem-nos no ecra, a um clique.
 */

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AllergenPanel } from '@/components/allergen-panel';
import { PrintButton } from '@/components/print-button';
import { buildCostContext } from '@/lib/mappers';
import { currencyOf } from '@/lib/money';
import { collectAllergens, type Allergen } from '@/lib/pricing/allergens';
import { flattenRecipe } from '@/lib/pricing/cost';
import { getPricingData, getRecipeDetail, getSettings } from '@/lib/queries';
import { baseUnitOf, formatBaseQty, DISPLAY_UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

export default async function ImprimirFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, data, s] = await Promise.all([
    getRecipeDetail(id),
    getPricingData(),
    getSettings(),
  ]);
  if (!recipe) notFound();

  const currency = currencyOf(s);
  const ctx = buildCostContext(data.ingredientRows, data.recipeRows);
  const porId = new Map(data.ingredientRows.map((i) => [i.id, i]));

  let achatada: ReturnType<typeof flattenRecipe> = [];
  try {
    achatada = flattenRecipe(id, 1, ctx);
  } catch {
    achatada = [];
  }

  const alergenios = collectAllergens(
    achatada.map((l) => {
      const ing = porId.get(l.ingredientId);
      return {
        ingredientId: l.ingredientId,
        name: l.name,
        category: l.category,
        via: l.via,
        allergens: (ing?.allergens ?? []) as Allergen[],
        reviewed: ing?.allergensReviewed ?? false,
      };
    }),
  );

  const isProduct = recipe.kind === 'PRODUCT';
  const rendimento = formatBaseQty(
    Number(recipe.yieldQty),
    recipe.yieldUnit,
    currency,
  );

  const impressoEm = new Intl.DateTimeFormat(currency.locale, {
    dateStyle: 'short',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      {/* Nao vai para o papel: so serve para chegar la. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        <Link
          href={`/fichas/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Voltar a ficha
        </Link>
        <span className="text-xs text-muted-foreground">
          Para PDF, escolha &quot;Guardar como PDF&quot; no dialogo de impressao.
        </span>
      </div>

      <article className="space-y-6">
        <header className="border-b pb-3">
          {/* Imagem e nao fundo: o "sem graficos de fundo" do dialogo de
              impressao, ligado por omissao, apagava um logotipo em CSS. No
              papel vai sempre o vinho; o creme so serve o ecra escuro. */}
          <div className="mb-3 flex items-end justify-between gap-4">
            <Image
              src="/logo-vinho.png"
              alt={s.businessName ?? 'Amo Brigs'}
              width={1200}
              height={342}
              priority
              className="h-12 w-auto dark:hidden print:!block"
            />
            <Image
              src="/logo-creme.png"
              alt=""
              aria-hidden
              width={1200}
              height={342}
              className="hidden h-12 w-auto dark:block print:!hidden"
            />
            <span className="text-xs text-muted-foreground">Ficha tecnica</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
            {s.businessName ? (
              <span className="text-sm text-muted-foreground">{s.businessName}</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isProduct ? 'Produto final' : 'Preparacao base'} · rende {rendimento}
            {recipe.description ? ` · ${recipe.description}` : ''}
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            Composicao do lote
          </h2>
          {recipe.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ficha sem ingredientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Ingrediente</th>
                  <th className="py-1.5 text-right font-medium">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {recipe.items.map((item) => {
                  const nome = item.ingredient?.name ?? item.childRecipe?.name ?? '—';
                  const base = item.ingredient
                    ? baseUnitOf(item.ingredient.purchaseUnit)
                    : (item.childRecipe?.yieldUnit ?? 'UN');
                  const linha = achatada.find((l) => l.name === nome);

                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1.5">
                        {nome}
                        {item.childRecipeId ? (
                          <span className="text-xs text-muted-foreground"> (base)</span>
                        ) : null}
                        {item.notes ? (
                          <span className="block text-xs text-muted-foreground">
                            {item.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {linha
                          ? formatBaseQty(linha.qtyBase, base, currency)
                          : `${Number(item.qty)} ${DISPLAY_UNIT_LABEL[base]}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            Alergenios
          </h2>
          <AllergenPanel report={alergenios} print />
        </section>

        <footer className="border-t pt-3 text-[10px] text-muted-foreground">
          Impresso a {impressoEm}. Confira se e a versao em vigor antes de afixar.
        </footer>
      </article>
    </div>
  );
}
