import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { TextoMarcado } from '@/components/marketing/texto-marcado';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { apagarSecaoGuia, guardarSecaoGuia, moverSecaoGuia } from '@/lib/actions/marketing';
import { getGuia } from '@/lib/marketing/consultas';
import { exigirMarketing } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const MARCACAO = (
  <>
    <code>## Subtítulo</code> · <code>### Título</code> · <code>- item</code> · <code>&gt; destaque</code> ·{' '}
    <code>~ nota</code> · <code>**negrito**</code>
  </>
);

function Campos({ s }: { s?: { id: string; title: string; body: string } }) {
  return (
    <>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <Field label="Título" htmlFor="g-tit">
        <Input id="g-tit" name="title" defaultValue={s?.title ?? ''} required />
      </Field>
      <Field label="Texto" htmlFor="g-body" hint={MARCACAO}>
        <Textarea id="g-body" name="body" rows={12} defaultValue={s?.body ?? ''} className="font-mono text-xs" />
      </Field>
    </>
  );
}

function Mover({ id, sentido, disabled }: { id: string; sentido: 'cima' | 'baixo'; disabled: boolean }) {
  return (
    <ActionForm action={moverSecaoGuia} showSuccess={false} className="space-y-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sentido" value={sentido} />
      <Button type="submit" variant="ghost" size="sm" disabled={disabled} className="text-muted-foreground">
        {sentido === 'cima' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        <span className="sr-only">{sentido === 'cima' ? 'Subir' : 'Descer'}</span>
      </Button>
    </ActionForm>
  );
}

export default async function GuiaPage() {
  await exigirMarketing();
  const secoes = await getGuia();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link href="/marketing" className="text-sm text-muted-foreground hover:underline">
            ← Campanhas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Guia de marketing</h1>
          <p className="text-sm text-muted-foreground">O que funciona, onde, e as regras. Toda a equipa pode editar.</p>
        </div>
        <FormDialog
          action={guardarSecaoGuia}
          title="Nova secção"
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Secção
            </Button>
          }
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        >
          <Campos />
        </FormDialog>
      </header>

      {secoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda vazio. Em <Link href="/marketing" className="underline">Campanhas</Link>, &quot;Criar o plano&quot;
          traz o guia de partida.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {secoes.map((s, n) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <CardTitle>{s.title}</CardTitle>
              <div className="flex items-center">
                <Mover id={s.id} sentido="cima" disabled={n === 0} />
                <Mover id={s.id} sentido="baixo" disabled={n === secoes.length - 1} />
                <FormDialog action={guardarSecaoGuia} title={s.title} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <Campos s={s} />
                </FormDialog>
                <ConfirmDelete action={apagarSecaoGuia} fields={{ id: s.id }} title={`Apagar "${s.title}"?`} />
              </div>
            </CardHeader>
            <CardContent>
              <TextoMarcado texto={s.body} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
