import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ActionFormKeep, KeepSubmitButton } from '@/components/action-form';
import { CamposConteudo } from '@/components/livro/campos-receita';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { novaVersao } from '@/lib/actions/livro';
import { podeEditarLivro } from '@/lib/auth';
import { detalheReceita } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function EditarReceitaPage({ params }: { params: Promise<{ id: string }> }) {
  const eu = await exigirSessao();
  const { id } = await params;
  if (!podeEditarLivro(eu.perfil)) redirect(`/receitas/${id}`);
  const r = await detalheReceita(id);
  if (!r) notFound();
  if (r.archivedAt) redirect(`/receitas/${id}`);

  const base = r.versions.find((v) => v.number === r.currentVersion) ?? r.versions[0];
  const proxima = r.versions[0].number + 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/receitas" className="hover:underline">
            Receitas
          </Link>
          <span>/</span>
          <Link href={`/receitas/${id}`} className="hover:underline">
            {r.title}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Alterar a receita</h1>
        <p className="text-sm text-muted-foreground">
          Parte da versão em uso ({base.number === 1 ? 'a original' : `versão ${base.number}`}). Ao
          guardar, fica como <strong>versão {proxima}</strong>, com o seu nome — a anterior não se
          perde, e pode comparar as duas.
        </p>
      </header>

      <ActionFormKeep action={novaVersao}>
        <input type="hidden" name="id" value={r.id} />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <CamposConteudo c={base} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>O que mudou</CardTitle>
            <CardDescription>
              Uma frase para quem ler o histórico daqui a um ano: o quê e porquê.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Porque mudou" htmlFor="changeNote">
              <Input
                id="changeNote"
                name="changeNote"
                placeholder="Menos açúcar: ficava doce demais com o recheio."
                required
              />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <KeepSubmitButton size="lg">Guardar versão {proxima}</KeepSubmitButton>
          <Link
            href={`/receitas/${id}`}
            className="inline-flex h-11 items-center px-4 text-sm text-muted-foreground hover:underline"
          >
            Cancelar
          </Link>
        </div>
      </ActionFormKeep>
    </div>
  );
}
