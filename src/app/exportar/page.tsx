import { Download, FileSpreadsheet, ShieldCheck } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { LISTAS, type ListaId } from '@/lib/exportar/listas';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Quantas linhas cada lista vai ter. Nao e enfeite: um "0" onde se esperava
 * uma centena avisa antes de se guardar um ficheiro vazio como copia.
 */
async function contagens(): Promise<Record<ListaId, number>> {
  const [insumos, fornecedores, ofertas, fichas, precos, movimentos, encomendas, despesas] =
    await prisma.$transaction([
      prisma.ingredient.count(),
      prisma.supplier.count(),
      prisma.supplierOffer.count(),
      prisma.recipeItem.count(),
      prisma.recipe.count({ where: { kind: 'PRODUCT' } }),
      prisma.stockMovement.count(),
      prisma.customerOrderLine.count(),
      prisma.expense.count(),
    ]);
  return { insumos, fornecedores, ofertas, fichas, precos, movimentos, encomendas, despesas };
}

export default async function ExportarPage() {
  const n = await contagens();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Exportar dados
          <AjudaLink secao="exportar" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Descarregue as listas para abrir no Excel, ou uma copia de tudo para guardar.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            Copia completa
          </CardTitle>
          <CardDescription>
            Todas as tabelas num ficheiro so (JSON), tal como estao na base. E a copia de
            seguranca: guarde-a fora deste computador, por exemplo no OneDrive ou numa pen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/exportar/copia"
            download
            className={cn(buttonVariants(), 'w-full sm:w-auto')}
          >
            <Download className="h-4 w-4" aria-hidden />
            Descarregar copia completa
          </a>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Listas para o Excel</h2>
          <p className="text-sm text-muted-foreground">
            Ficheiros CSV com virgula decimal e acentos, prontos para abrir em portugues.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LISTAS.map((l) => (
            <li key={l.id}>
              <a
                href={`/api/exportar/${l.id}`}
                download
                className="flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileSpreadsheet
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{l.titulo}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {n[l.id]} {n[l.id] === 1 ? 'linha' : 'linhas'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {l.descricao}
                  </span>
                </span>
                <Download
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
