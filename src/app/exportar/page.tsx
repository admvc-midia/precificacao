import { Download, FileSpreadsheet, History, RotateCcw, ShieldCheck } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { RestaurarCopia } from '@/components/copia/restaurar-copia';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { listarCopias, type CopiaGuardada } from '@/lib/exportar/guardadas';
import { LISTAS, type ListaId } from '@/lib/exportar/listas';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Quantas linhas cada lista vai ter. Nao e enfeite: um "0" onde se esperava
 * uma centena avisa antes de se guardar um ficheiro vazio como copia.
 */
async function contagens() {
  const [insumos, fornecedores, ofertas, fichas, precos, movimentos, encomendas, despesas, produtos, clientes, pedidos, receitas] =
    await prisma.$transaction([
      prisma.ingredient.count(),
      prisma.supplier.count(),
      prisma.supplierOffer.count(),
      prisma.recipeItem.count(),
      prisma.recipe.count({ where: { kind: 'PRODUCT' } }),
      prisma.stockMovement.count(),
      prisma.customerOrderLine.count(),
      prisma.expense.count(),
      prisma.recipe.count(),
      prisma.customer.count(),
      prisma.customerOrder.count(),
      prisma.bookRecipe.count(),
    ]);
  const listas: Record<ListaId, number> = { insumos, fornecedores, ofertas, fichas, precos, movimentos, encomendas, despesas };
  return { listas, resumo: { insumos, fichas: produtos, clientes, encomendas: pedidos, receitas } };
}

/** Sem Blob (ou o Blob em baixo), a pagina abre na mesma — so sem a lista. */
async function guardadas(): Promise<CopiaGuardada[] | null> {
  try {
    return await listarCopias();
  } catch (err) {
    console.warn('[copias] nao consegui listar', err);
    return null;
  }
}

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const dataHora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default async function ExportarPage() {
  const [{ listas: n, resumo }, copias] = await Promise.all([contagens(), guardadas()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cópia de segurança
          <AjudaLink secao="exportar" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Faça uma cópia de tudo para guardar, reponha uma cópia, ou descarregue listas para o Excel.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            Fazer cópia agora
          </CardTitle>
          <CardDescription>
            Todas as tabelas num só ficheiro (JSON), tal como estão na base. Guarde-o fora deste
            computador, por exemplo no OneDrive ou numa pen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Leva hoje {qtd(resumo.insumos, 'insumo', 'insumos')}, {qtd(resumo.fichas, 'ficha', 'fichas')},{' '}
            {qtd(resumo.clientes, 'cliente', 'clientes')}, {qtd(resumo.encomendas, 'encomenda', 'encomendas')} e{' '}
            {qtd(resumo.receitas, 'receita do livro', 'receitas do livro')} — e tudo o resto.
            As palavras-passe nunca vão no ficheiro.
          </p>
          <a href="/api/exportar/copia" download className={cn(buttonVariants(), 'w-full sm:w-auto')}>
            <Download className="h-4 w-4" aria-hidden />
            Descarregar cópia completa
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" aria-hidden />
            Restaurar uma cópia
          </CardTitle>
          <CardDescription>
            A base volta a ficar exatamente como no dia da cópia: o que foi feito depois perde-se.
            Contas, palavras-passe e o registo de alterações não mudam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestaurarCopia />
        </CardContent>
      </Card>

      {copias && copias.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" aria-hidden />
              Cópias guardadas pela app
            </CardTitle>
            <CardDescription>
              Antes de cada restauro, a app guarda aqui o que havia. Se um restauro foi engano,
              descarregue a de antes e restaure-a.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {copias.slice(0, 10).map((c) => (
                <li key={c.caminho} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    Antes do restauro de <strong>{dataHora.format(c.gravadaEm)}</strong>
                    <span className="text-muted-foreground"> · {Math.max(1, Math.round(c.tamanho / 1024))} KB</span>
                  </span>
                  <a
                    href={`/api/copias?c=${encodeURIComponent(c.caminho)}`}
                    download
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Descarregar
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Listas para o Excel</h2>
          <p className="text-sm text-muted-foreground">
            Ficheiros CSV com vírgula decimal e acentos, prontos para abrir em português.
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
