import Link from 'next/link';

import { AjudaLink } from '@/components/ajuda-link';
import { NovaEncomenda } from '@/components/encomendas/nova-encomenda';
import { Alert } from '@/components/ui/badge';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getChannels, getCostedRecipes, getCustomers } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function NovaEncomendaPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente } = await searchParams;
  const [{ recipes, settings, currency, channels }, clientes, canais] = await Promise.all([
    getCostedRecipes(),
    getCustomers(),
    getChannels(),
  ]);

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
      return {
        id: r.id,
        name: r.name,
        listPrice: preco?.feasible && preco.price > 0 ? preco.price : null,
      };
    });

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
