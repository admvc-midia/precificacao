'use client';

/**
 * Importar uma receita: escolher o PDF (ou colar o texto), a app separa-o, e
 * abre-se a revisao — o formulario ja preenchido de um lado, o texto que veio
 * do ficheiro do outro, para acertar o que a separacao automatica falhou.
 *
 * Nada se cria ate carregar em "Guardar receita".
 */

import { useActionState } from 'react';
import { AlertTriangle, FileUp, Loader2 } from 'lucide-react';

import { ActionFormKeep, KeepSubmitButton } from '@/components/action-form';
import { CamposConteudo, CamposDados } from '@/components/livro/campos-receita';
import { Alert } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { criarReceita, importarReceita, type ImportState } from '@/lib/actions/livro';

const INICIAL: ImportState = { ok: true };

export function ImportarReceita({
  fichas,
  livros,
}: {
  fichas?: Array<{ id: string; name: string }>;
  livros: Array<{ id: string; title: string }>;
}) {
  const [estado, ler, aLer] = useActionState(importarReceita, INICIAL);
  const r = estado.receita;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" aria-hidden />
            {r ? 'Ler outro ficheiro' : 'De onde vem a receita'}
          </CardTitle>
          <CardDescription>
            Um PDF com texto (exportado do Word, de um site, de um curso), até 3,8 MB — ou cole o
            texto. PDFs digitalizados (fotografias de páginas) não têm texto para ler.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={ler} className="space-y-4">
            <Field label="Ficheiro PDF ou .txt" htmlFor="ficheiro">
              <Input id="ficheiro" name="ficheiro" type="file" accept="application/pdf,.pdf,text/plain,.txt" />
            </Field>
            <Field label="…ou cole o texto" htmlFor="texto">
              <Textarea id="texto" name="texto" rows={r ? 3 : 8} placeholder="Título, ingredientes, modo de preparo…" />
            </Field>
            {!estado.ok && estado.message ? (
              <Alert tone="destructive">{estado.message}</Alert>
            ) : null}
            <Button type="submit" variant={r ? 'outline' : 'default'} disabled={aLer}>
              {aLer ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  A ler…
                </>
              ) : (
                'Ler a receita'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {r ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>O texto que veio{estado.ficheiro ? ` de ${estado.ficheiro.nome}` : ''}</CardTitle>
              <CardDescription>Para copiar o que a separação automática deixou de fora.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 font-sans text-xs">
                {estado.texto}
              </pre>
            </CardContent>
          </Card>

          {/* A chave refaz o formulario a cada leitura: os valores por omissao mudam. */}
          <ActionFormKeep key={estado.chave} action={criarReceita}>
            {r.avisos.length > 0 ? (
              <Alert tone="warning" className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {r.avisos.join(' ')} Confira tudo antes de guardar.
                </span>
              </Alert>
            ) : (
              <Alert tone="info">Confira a separação antes de guardar — fica como a versão original.</Alert>
            )}

            {estado.ficheiro ? (
              <>
                <input type="hidden" name="sourceFilePath" value={estado.ficheiro.caminho} />
                <input type="hidden" name="sourceFileName" value={estado.ficheiro.nome} />
              </>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>A receita</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CamposDados d={{ title: r.title }} fichas={fichas} prefixo="imp" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ingredientes e preparo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CamposConteudo
                  prefixo="imp"
                  c={{
                    ingredients: r.ingredients.join('\n'),
                    steps: r.steps.join('\n\n'),
                    yield: r.yield,
                    prepTime: r.prepTime,
                    notes: r.notes,
                  }}
                />
              </CardContent>
            </Card>

            {livros.length > 0 ? (
              <Card>
                <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
                  <Field label="Juntar ao livro" htmlFor="imp-livro">
                    <Select id="imp-livro" name="cookbookId" defaultValue="">
                      <option value="">Nenhum</option>
                      {livros.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Secção" htmlFor="imp-seccao">
                    <Input id="imp-seccao" name="section" placeholder="Bolos" />
                  </Field>
                </CardContent>
              </Card>
            ) : null}

            <KeepSubmitButton size="lg" className="w-full sm:w-auto">
              Guardar receita
            </KeepSubmitButton>
          </ActionFormKeep>
        </div>
      ) : null}
    </div>
  );
}
