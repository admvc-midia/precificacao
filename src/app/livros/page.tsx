import Link from 'next/link';
import { Library, Plus } from 'lucide-react';

import { FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposLivro } from '@/components/livro/campos-livro';
import { Button } from '@/components/ui/button';
import { criarLivro } from '@/lib/actions/livro';
import { podeEditarLivro } from '@/lib/auth';
import { listarLivros } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LivrosPage() {
  const eu = await exigirSessao();
  const livros = await listarLivros();
  const editor = podeEditarLivro(eu.perfil);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Livros de receitas
            <AjudaLink secao="receitas" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Receitas arrumadas por secções, prontas a imprimir em PDF. A mesma receita pode estar em
            vários livros.
          </p>
        </div>
        {editor ? (
          <FormDialog
            action={criarLivro}
            title="Novo livro"
            submitLabel="Criar livro"
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo livro
              </Button>
            }
          >
            <CamposLivro />
          </FormDialog>
        ) : null}
      </header>

      {livros.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Ainda não há livros.{editor ? ' Crie o primeiro — por exemplo, "Receitas da família".' : ''}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {livros.map((l) => (
            <li key={l.id}>
              <Link
                href={`/livros/${l.id}`}
                className="flex h-full gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <Library className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="space-y-1">
                  <span className="block font-titulo text-lg font-semibold leading-tight">{l.title}</span>
                  {l.subtitle ? <span className="block text-sm text-muted-foreground">{l.subtitle}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    {l._count.entries} receita{l._count.entries === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
