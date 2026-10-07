import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Printer, X } from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  FormDialog,
  SubmitButton,
} from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposLivro } from '@/components/livro/campos-livro';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import {
  alterarEntrada,
  alterarLivro,
  apagarLivro,
  juntarAoLivro,
  moverEntrada,
  tirarDoLivro,
} from '@/lib/actions/livro';
import { podeEditarLivro } from '@/lib/auth';
import { detalheLivro, porSeccao, receitasForaDoLivro } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function LivroPage({ params }: { params: Promise<{ id: string }> }) {
  const eu = await exigirSessao();
  const { id } = await params;
  const livro = await detalheLivro(id);
  if (!livro) notFound();

  const editor = podeEditarLivro(eu.perfil);
  const fora = editor ? await receitasForaDoLivro(id) : [];
  const seccoes = porSeccao(livro.entries);
  const nomesDeSeccao = [...new Set(livro.entries.map((e) => e.section).filter(Boolean))] as string[];
  const ultima = livro.entries.length - 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/livros" className="text-sm text-muted-foreground hover:underline">
              Livros
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="font-titulo text-3xl font-semibold tracking-tight">
              {livro.title}
              <AjudaLink secao="receitas" />
            </h1>
            {editor ? (
              <FormDialog action={alterarLivro} title="Alterar o livro">
                <input type="hidden" name="id" value={livro.id} />
                <CamposLivro d={livro} />
              </FormDialog>
            ) : null}
          </div>
          {livro.subtitle ? <p className="text-muted-foreground">{livro.subtitle}</p> : null}
          {livro.description ? (
            <p className="max-w-2xl whitespace-pre-line text-sm text-muted-foreground">{livro.description}</p>
          ) : null}
        </div>
        {livro.entries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/livros/${livro.id}/imprimir`}
              target="_blank"
              className={buttonVariants()}
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </Link>
            <Link
              href={`/livros/${livro.id}/imprimir?versao=original`}
              target="_blank"
              className={buttonVariants({ variant: 'outline' })}
            >
              Com as originais
            </Link>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Índice</CardTitle>
            <CardDescription>
              {livro.entries.length} receita{livro.entries.length === 1 ? '' : 's'}, pela ordem do
              livro. As receitas arquivadas não aparecem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {livro.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Livro vazio. Junte a primeira receita.</p>
            ) : (
              <div className="space-y-5">
                {seccoes.map(({ seccao, itens }) => (
                  <section key={seccao ?? '-'} className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {seccao ?? 'Outras'}
                    </h2>
                    <ul className="divide-y rounded-md border">
                      {itens.map((e) => {
                        const pos = livro.entries.indexOf(e);
                        return (
                          <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <Link href={`/receitas/${e.recipe.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                              {e.recipe.title}
                            </Link>
                            {e.recipe.currentVersion > 1 ? (
                              <Badge variant="secondary" className="hidden sm:inline-flex">
                                versão {e.recipe.currentVersion}
                              </Badge>
                            ) : null}
                            {editor ? (
                              <span className="flex shrink-0 items-center">
                                <Mover id={e.id} sentido="cima" desligado={pos === 0} />
                                <Mover id={e.id} sentido="baixo" desligado={pos === ultima} />
                                <FormDialog action={alterarEntrada} title={`Secção de ${e.recipe.title}`}>
                                  <input type="hidden" name="id" value={e.id} />
                                  <Field label="Secção" htmlFor={`s-${e.id}`} hint="Vazio: vai para «Outras».">
                                    <Input
                                      id={`s-${e.id}`}
                                      name="section"
                                      list="seccoes"
                                      defaultValue={e.section ?? ''}
                                    />
                                  </Field>
                                </FormDialog>
                                <ConfirmDelete
                                  action={tirarDoLivro}
                                  fields={{ id: e.id }}
                                  title={`Tirar "${e.recipe.title}" deste livro?`}
                                  description="A receita não se apaga: continua nas Receitas e nos outros livros."
                                  confirmLabel="Tirar do livro"
                                  trigger={
                                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                      <X className="h-4 w-4" />
                                      <span className="sr-only">Tirar do livro</span>
                                    </Button>
                                  }
                                />
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            <datalist id="seccoes">
              {nomesDeSeccao.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </CardContent>
        </Card>

        {editor ? (
          <div className="space-y-6">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Juntar receita</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {fora.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todas as receitas já estão neste livro.
                  </p>
                ) : (
                  <ActionForm action={juntarAoLivro} showSuccess={false} className="space-y-3">
                    <input type="hidden" name="cookbookId" value={livro.id} />
                    <Field label="Receita" htmlFor="j-receita">
                      <Select id="j-receita" name="recipeId" required defaultValue="">
                        <option value="" disabled>
                          Escolha…
                        </option>
                        {fora.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Secção" htmlFor="j-seccao">
                      <Input id="j-seccao" name="section" list="seccoes" placeholder="Bolos" />
                    </Field>
                    <SubmitButton variant="outline" className="w-full">
                      Juntar
                    </SubmitButton>
                  </ActionForm>
                )}
                <Link
                  href={`/receitas/nova?livro=${livro.id}`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full')}
                >
                  <Plus className="h-4 w-4" />
                  Escrever uma receita nova
                </Link>
              </CardContent>
            </Card>

            {eu.perfil === 'OWNER' ? (
              <ConfirmDelete
                action={apagarLivro}
                fields={{ id: livro.id }}
                title={`Apagar o livro "${livro.title}"?`}
                description="Apaga o livro e a sua arrumação. As receitas não se apagam."
                confirmLabel="Apagar livro"
                trigger={
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                    Apagar livro
                  </Button>
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Mover({ id, sentido, desligado }: { id: string; sentido: 'cima' | 'baixo'; desligado: boolean }) {
  const Icone = sentido === 'cima' ? ArrowUp : ArrowDown;
  return (
    <ActionForm action={moverEntrada} showSuccess={false} className="space-y-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sentido" value={sentido} />
      <SubmitButton
        variant="ghost"
        size="sm"
        disabled={desligado}
        pendingLabel=""
        className="px-2 text-muted-foreground"
      >
        <Icone className="h-4 w-4" />
        <span className="sr-only">{sentido === 'cima' ? 'Subir' : 'Descer'}</span>
      </SubmitButton>
    </ActionForm>
  );
}
