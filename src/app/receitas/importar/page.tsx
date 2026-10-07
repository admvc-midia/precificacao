import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AjudaLink } from '@/components/ajuda-link';
import { ImportarReceita } from '@/components/livro/importar-receita';
import { podeEditarLivro } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listarLivros } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function ImportarPage() {
  const eu = await exigirSessao();
  if (!podeEditarLivro(eu.perfil)) redirect('/receitas');

  const [livros, fichas] = await Promise.all([
    listarLivros(),
    eu.perfil === 'OWNER'
      ? prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve(undefined),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/receitas" className="text-sm text-muted-foreground hover:underline">
            Receitas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Importar receita
            <AjudaLink secao="receitas" />
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          A app separa o título, os ingredientes e o modo de preparo. Revê-se antes de guardar; o
          PDF fica guardado junto da receita.
        </p>
      </header>
      <ImportarReceita fichas={fichas} livros={livros.map((l) => ({ id: l.id, title: l.title }))} />
    </div>
  );
}
