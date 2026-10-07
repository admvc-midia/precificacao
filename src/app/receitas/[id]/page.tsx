import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BookOpen,
  ExternalLink,
  FileText,
  GitCompare,
  History,
  Pencil,
  Printer,
  Tag,
} from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  FormDialog,
  SubmitButton,
} from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { FotoProduto } from '@/components/foto-produto';
import { CamposDados } from '@/components/livro/campos-receita';
import { Ingredientes, Passos } from '@/components/livro/receita-texto';
import { Alert, Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import {
  alterarDadosReceita,
  apagarReceita,
  arquivarReceita,
  guardarFotoReceita,
  juntarAoLivro,
  tirarFotoReceita,
  usarVersao,
} from '@/lib/actions/livro';
import { podeEditarLivro } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fotoReceitaSrc } from '@/lib/foto-url';
import { detalheReceita, listarLivros } from '@/lib/livro/consultas';
import { SOURCE_KIND_LABEL } from '@/lib/livro/receita';
import { exigirSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const dataFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' });

export default async function ReceitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const eu = await exigirSessao();
  const { id } = await params;
  const { v } = await searchParams;
  const r = await detalheReceita(id);
  if (!r) notFound();

  const editor = podeEditarLivro(eu.perfil);
  const dono = eu.perfil === 'OWNER';
  const [livros, fichas] = await Promise.all([
    editor ? listarLivros() : Promise.resolve([]),
    dono
      ? prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve(undefined),
  ]);

  const emUso = r.versions.find((x) => x.number === r.currentVersion) ?? r.versions[0];
  const pedida = v ? r.versions.find((x) => x.number === Number(v)) : undefined;
  const mostrada = pedida ?? emUso;
  const original = r.versions[r.versions.length - 1];
  const foraDoLivro = livros.filter((l) => !r.entries.some((e) => e.cookbook.id === l.id));
  // A ficha nao acompanha as versoes: avisa-se quando a receita mudou depois dela.
  const fichaDesatualizada = r.ficha && emUso.createdAt > r.ficha.updatedAt && emUso.number > 1;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/receitas" className="text-sm text-muted-foreground hover:underline">
            Receitas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="font-titulo text-3xl font-semibold tracking-tight">
            {r.title}
            <AjudaLink secao="receitas" />
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {r.archivedAt ? <Badge variant="warning">arquivada</Badge> : null}
          <Badge variant={mostrada.number === 1 ? 'outline' : 'secondary'}>
            {mostrada.number === 1 ? 'versão original' : `versão ${mostrada.number}`}
            {mostrada.number === r.currentVersion ? ' · em uso' : ''}
          </Badge>
          {r.tags.map((t) => (
            <Link key={t} href={`/receitas?etiqueta=${encodeURIComponent(t)}`}>
              <Badge variant="outline">
                <Tag className="mr-1 h-3 w-3" aria-hidden />
                {t}
              </Badge>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {editor && !r.archivedAt ? (
            <Link href={`/receitas/${r.id}/editar`} className={buttonVariants()}>
              <Pencil className="h-4 w-4" />
              Alterar receita
            </Link>
          ) : null}
          {r.versions.length > 1 ? (
            <Link
              href={`/receitas/${r.id}/comparar?de=1&para=${r.currentVersion === 1 ? r.versions[0].number : r.currentVersion}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <GitCompare className="h-4 w-4" />
              Comparar com a original
            </Link>
          ) : null}
          <Link
            href={`/receitas/${r.id}/imprimir?v=${mostrada.number}`}
            target="_blank"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Link>
        </div>
      </header>

      {pedida && pedida.number !== r.currentVersion ? (
        <Alert tone="info" className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Está a ver a <strong>versão {pedida.number}</strong>
            {pedida.number === 1 ? ' (a original)' : ''}, de {dataFmt.format(pedida.createdAt)}. A versão
            em uso é a {r.currentVersion}.
          </span>
          {editor && !r.archivedAt ? (
            <ActionForm action={usarVersao} showSuccess={false} className="space-y-0">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="number" value={pedida.number} />
              <SubmitButton size="sm" variant="outline">
                Usar esta versão
              </SubmitButton>
            </ActionForm>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {mostrada.yield || mostrada.prepTime ? (
            <div className="flex flex-wrap gap-6 text-sm">
              {mostrada.yield ? (
                <p>
                  <span className="text-muted-foreground">Rendimento: </span>
                  <strong>{mostrada.yield}</strong>
                </p>
              ) : null}
              {mostrada.prepTime ? (
                <p>
                  <span className="text-muted-foreground">Tempo: </span>
                  <strong>{mostrada.prepTime}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Ingredientes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Ingredientes texto={mostrada.ingredients} />
              </CardContent>
            </Card>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Modo de preparo</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed">
                <Passos texto={mostrada.steps} />
              </CardContent>
            </Card>
          </div>

          {mostrada.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notas e dicas</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{mostrada.notes}</CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {r.photoPath || (editor && !r.archivedAt) ? (
            <FotoProduto
              recipeId={r.id}
              nome={r.title}
              src={fotoReceitaSrc(r.id, r.photoPath)}
              guardar={guardarFotoReceita}
              remover={tirarFotoReceita}
              podeEditar={editor && !r.archivedAt}
            />
          ) : null}

          {/* ------------------------------------------------ origem */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
              <CardTitle>Origem</CardTitle>
              {editor && !r.archivedAt ? (
                <FormDialog
                  action={alterarDadosReceita}
                  title="Dados da receita"
                  description="Título, origem e etiquetas não criam versão nova."
                  className="max-h-[90vh] overflow-y-auto"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <CamposDados d={r} fichas={fichas} prefixo="dados" />
                </FormDialog>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">
                  {r.sourceKind ? SOURCE_KIND_LABEL[r.sourceKind] : 'Origem por indicar'}
                </span>
                {r.sourceName ? <span className="block font-medium">{r.sourceName}</span> : null}
              </p>
              {r.sourceUrl ? (
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {new URL(r.sourceUrl).hostname}
                </a>
              ) : null}
              {r.sourceFilePath ? (
                <a
                  href={`/api/receitas/${r.id}/original`}
                  target="_blank"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {r.sourceFileName ?? 'PDF original'}
                </a>
              ) : null}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ ficha (so o dono) */}
          {dono && r.ficha ? (
            <Card>
              <CardHeader>
                <CardTitle>Ficha técnica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link href={`/fichas/${r.ficha.id}`} className="font-medium text-primary hover:underline">
                  {r.ficha.name}
                </Link>
                {fichaDesatualizada ? (
                  <Alert tone="warning" className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      A receita mudou (versão {emUso.number}, {dataFmt.format(emUso.createdAt)}) depois
                      da última alteração da ficha. Confira se as quantidades da ficha ainda batem —
                      os custos saem dela.
                    </span>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* ------------------------------------------------ livros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                Nos livros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {r.entries.length === 0 ? (
                <p className="text-muted-foreground">Ainda em nenhum livro.</p>
              ) : (
                <ul className="space-y-1">
                  {r.entries.map((e) => (
                    <li key={e.id}>
                      <Link href={`/livros/${e.cookbook.id}`} className="text-primary hover:underline">
                        {e.cookbook.title}
                      </Link>
                      {e.section ? <span className="text-muted-foreground"> · {e.section}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {editor && !r.archivedAt && foraDoLivro.length > 0 ? (
                <ActionForm action={juntarAoLivro} showSuccess={false} className="space-y-2 border-t pt-3">
                  <input type="hidden" name="recipeId" value={r.id} />
                  <Field label="Juntar a um livro" htmlFor="j-livro">
                    <Select id="j-livro" name="cookbookId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {foraDoLivro.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Input name="section" placeholder="Secção (opcional): Bolos" aria-label="Secção" />
                  <SubmitButton size="sm" variant="outline">
                    Juntar
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ historico */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" aria-hidden />
                Versões
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="divide-y">
                {r.versions.map((x, i) => {
                  const anterior = r.versions[i + 1];
                  return (
                    <li
                      key={x.id}
                      className={cn('space-y-1 px-6 py-3 text-sm', x.number === mostrada.number && 'bg-accent/40')}
                    >
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/receitas/${r.id}?v=${x.number}`} className="font-medium hover:underline">
                          {x.number === 1 ? 'Original' : `Versão ${x.number}`}
                        </Link>
                        {x.number === r.currentVersion ? <Badge variant="success">em uso</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dataFmt.format(x.createdAt)} · {x.authorName}
                      </p>
                      {x.changeNote && x.number > 1 ? <p className="text-xs italic">“{x.changeNote}”</p> : null}
                      {anterior ? (
                        <Link
                          href={`/receitas/${r.id}/comparar?de=${anterior.number}&para=${x.number}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <GitCompare className="h-3 w-3" aria-hidden />
                          o que mudou
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <p className="px-6 pb-4 pt-2 text-xs text-muted-foreground">
                Original de {dataFmt.format(original.createdAt)}, registada por {original.authorName}.
              </p>
            </CardContent>
          </Card>

          {editor ? (
            <div className="flex flex-wrap gap-2">
              <ActionForm action={arquivarReceita} showSuccess={false} className="space-y-0">
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton variant="ghost" size="sm" className="text-muted-foreground">
                  {r.archivedAt ? (
                    <>
                      <ArchiveRestore className="h-4 w-4" />
                      Recuperar
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" />
                      Arquivar
                    </>
                  )}
                </SubmitButton>
              </ActionForm>
              {dono ? (
                <ConfirmDelete
                  action={apagarReceita}
                  fields={{ id: r.id }}
                  title={`Apagar "${r.title}" de vez?`}
                  description="Apaga a receita, todas as versões e o PDF original. Não se desfaz. Para a tirar de vista sem a perder, use Arquivar."
                  confirmLabel="Apagar de vez"
                  trigger={
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                      Apagar de vez
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
