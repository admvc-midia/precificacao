import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionFormKeep, KeepSubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposConteudo, CamposDados } from '@/components/livro/campos-receita';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { criarReceita } from '@/lib/actions/livro';
import { podeEditarLivro } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listarLivros } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function NovaReceitaPage({
  searchParams,
}: {
  searchParams: Promise<{ livro?: string }>;
}) {
  const eu = await exigirSessao();
  if (!podeEditarLivro(eu.perfil)) redirect('/receitas');
  const { livro } = await searchParams;

  const [livros, fichas] = await Promise.all([
    listarLivros(),
    eu.perfil === 'OWNER'
      ? prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve(undefined),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/receitas" className="text-sm text-muted-foreground hover:underline">
            Receitas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nova receita
            <AjudaLink secao="receitas" />
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Escreva-a tal como veio da fonte: esta fica como a <strong>versão original</strong>. As
          alterações da cozinha fazem-se depois, e cada uma fica como uma versão nova.
        </p>
      </header>

      <ActionFormKeep action={criarReceita}>
        <Card>
          <CardHeader>
            <CardTitle>A receita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CamposDados fichas={fichas} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingredientes e preparo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CamposConteudo />
          </CardContent>
        </Card>

        {livros.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Num livro</CardTitle>
              <CardDescription>Opcional. Também se junta depois, na página do livro.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Livro" htmlFor="livro">
                <Select id="livro" name="cookbookId" defaultValue={livro ?? ''}>
                  <option value="">Nenhum</option>
                  {livros.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Secção" htmlFor="seccao">
                <Input id="seccao" name="section" placeholder="Bolos" />
              </Field>
            </CardContent>
          </Card>
        ) : null}

        <KeepSubmitButton size="lg" className="w-full sm:w-auto">
          Guardar receita
        </KeepSubmitButton>
      </ActionFormKeep>
    </div>
  );
}
