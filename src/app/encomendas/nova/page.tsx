import Link from 'next/link';

import { AjudaLink } from '@/components/ajuda-link';
import { NovaEncomenda } from '@/components/encomendas/nova-encomenda';
import { Alert } from '@/components/ui/badge';
import { PREFIXO_COMBO } from '@/lib/cardapio/encomenda';
import { promocaoInput } from '@/lib/cardapio/consultas';
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getChannels, getCostedRecipes, getCustomers } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function NovaEncomendaPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente } = await searchParams;
  const [{ recipes, settings, currency, channels }, clientes, canais, itens, promos] = await Promise.all([
    getCostedRecipes(),
    getCustomers(),
    getChannels(),
    prisma.menuItem.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { components: { include: { recipe: { select: { name: true } } } } },
    }),
    prisma.promotion.findMany({ where: { active: true }, include: { items: { select: { menuItemId: true } } } }),
  ]);
  const doCardapio = new Map(itens.filter((i) => i.recipeId).map((i) => [i.recipeId!, i]));

  const opcoes = clientes.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    consent: c.contactConsentAt !== null,
  }));

  const ref = referenceChannel(channels);
  const produtos = recipes
    .filter((r) => r.kind === 'PRODUCT' && !r.error)
    .map((r) => {
      const preco = priceForRecipe(r, ref, settings);
      const menu = doCardapio.get(r.id);
      return {
        id: r.id,
        name: r.name,
        // O preco do cardapio, se a ficha la estiver; senao o de tabela.
        listPrice: menu ? num(menu.price) : preco?.feasible && preco.price > 0 ? preco.price : null,
        menuItemId: menu?.id ?? null,
      };
    });
  const combos = itens
    .filter((i) => i.kind === 'COMBO')
    .map((i) => ({
      id: `${PREFIXO_COMBO}${i.id}`,
      name: i.name ?? 'Combo',
      listPrice: num(i.price),
      menuItemId: i.id,
      leva: i.components.map((c) => `${num(c.qty)} × ${c.recipe.name}`).join(', '),
    }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/encomendas" className="text-sm text-muted-foreground hover:underline">
            Encomendas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nova encomenda
            <AjudaLink secao="encomendas" />
          </h1>
        </div>
      </header>

      {produtos.length === 0 ? (
        <Alert tone="info">
          Não há produtos finais com custo calculado.{' '}
          <Link href="/fichas" className="underline">
            Crie uma ficha técnica
          </Link>{' '}
          primeiro.
        </Alert>
      ) : (
        <NovaEncomenda
          produtos={produtos}
          combos={combos}
          promocoes={promos.map((p) => promocaoInput(p))}
          clientes={opcoes}
          clienteInicial={opcoes.find((c) => c.id === cliente)}
          canais={canais.map((c) => ({ id: c.id, name: c.name }))}
          canalPadrao={ref?.id ?? ''}
          currency={currency}
        />
      )}
    </div>
  );
}
