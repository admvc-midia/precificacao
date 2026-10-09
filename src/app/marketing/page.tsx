import Link from 'next/link';
import { AlertTriangle, BookOpen, CheckCircle2, Plus, Sparkles } from 'lucide-react';

import { ActionForm, FormDialog, SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposCampanha } from '@/components/marketing/campos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { comecarComRecomendacoes, guardarCampanha } from '@/lib/actions/marketing';
import { diaEmLisboa } from '@/lib/datas';
import {
  atrasada,
  CANAL_LABEL,
  ESTADO_LABEL,
  mesmaPessoa,
  progresso,
  proximaTarefa,
  type EstadoCampanha,
} from '@/lib/marketing/contas';
import { getCampanhas, getGuia } from '@/lib/marketing/consultas';
import { exigirMarketing } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const COLUNAS: EstadoCampanha[] = ['IDEA', 'PLANNED', 'ACTIVE', 'DONE'];
const diaCurto = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const diaDe = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ quem?: string }> }) {
  await exigirMarketing();
  const { quem = '' } = await searchParams;
  const [campanhas, guia] = await Promise.all([getCampanhas(), getGuia()]);
  const hoje = diaEmLisboa(new Date());

  const comContas = campanhas.map((c) => {
    const tarefas = c.tasks.map((t) => ({ ...t, dueAt: diaDe(t.dueAt) }));
    return {
      c,
      tarefas,
      prog: progresso(tarefas),
      proxima: proximaTarefa(tarefas),
      atrasadas: tarefas.filter((t) => atrasada(t, hoje)).length,
    };
  });

  const minhas = quem.trim()
    ? comContas
        .flatMap(({ c, tarefas }) => tarefas.filter((t) => !t.done && mesmaPessoa(t.assignee, quem)).map((t) => ({ t, c })))
        .sort((a, b) => (a.t.dueAt ?? '9999').localeCompare(b.t.dueAt ?? '9999'))
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Campanhas
            <AjudaLink secao="marketing" />
          </h1>
          <p className="text-sm text-muted-foreground">Divulgação da AmoBrigs: o que se vai fazer, quem faz, até quando.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/marketing/guia">
              <BookOpen className="h-4 w-4" />
              Guia
            </Link>
          </Button>
          <FormDialog
            action={guardarCampanha}
            title="Nova campanha"
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Campanha
              </Button>
            }
            className="max-h-[90vh] overflow-y-auto"
          >
            <CamposCampanha />
          </FormDialog>
        </div>
      </header>

      {campanhas.length === 0 && guia.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Começar com as recomendações</CardTitle>
            <CardDescription>
              Cria 6 campanhas (Lançamento do cardápio, Parcerias locais, Indique uma amiga, Datas
              comemorativas, Natal para empresas, Verão e turismo), cada uma com as suas tarefas e
              prazos, e o guia (canais, conteúdo, anúncios, impressos, regras, como medir). Depois
              é tudo editável.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={comecarComRecomendacoes}>
              <SubmitButton>
                <Sparkles className="h-4 w-4" />
                Criar o plano
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="quem" className="text-sm text-muted-foreground">
          As tarefas de
        </label>
        <Input id="quem" name="quem" defaultValue={quem} placeholder="nome" className="h-9 w-40" />
        <Button type="submit" variant="outline" size="sm">
          Ver
        </Button>
        {quem ? (
          <Link href="/marketing" className="text-sm text-muted-foreground hover:underline">
            Limpar
          </Link>
        ) : null}
      </form>

      {minhas ? (
        <Card>
          <CardHeader>
            <CardTitle>Por fazer: {quem}</CardTitle>
          </CardHeader>
          <CardContent>
            {minhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada por fazer com este nome.</p>
            ) : (
              <ul className="divide-y text-sm">
                {minhas.map(({ t, c }) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <Link href={`/marketing/${c.id}`} className="hover:underline">
                      {t.title} <span className="text-muted-foreground">· {c.title}</span>
                    </Link>
                    {t.dueAt ? (
                      <span className={cn('tabular-nums', atrasada(t, hoje) && 'font-medium text-red-700 dark:text-red-400')}>
                        {diaCurto(t.dueAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUNAS.map((estado) => {
          const daColuna = comContas.filter((x) => x.c.status === estado);
          return (
            <section key={estado} className="space-y-3">
              <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ESTADO_LABEL[estado]}
                <span className="tabular-nums">{daColuna.length}</span>
              </h2>
              {daColuna.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : null}
              {daColuna.map(({ c, prog, proxima, atrasadas }) => (
                <Link key={c.id} href={`/marketing/${c.id}`} className="block">
                  <Card className="transition-colors hover:border-primary">
                    <CardHeader className="space-y-1 p-4">
                      <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                      {c.startsAt || c.endsAt ? (
                        <CardDescription className="text-xs">
                          {c.startsAt ? diaCurto(diaDe(c.startsAt)!) : '…'} → {c.endsAt ? diaCurto(diaDe(c.endsAt)!) : '…'}
                        </CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-2 p-4 pt-0 text-xs">
                      {c.channels.length ? (
                        <div className="flex flex-wrap gap-1">
                          {c.channels.map((k) => (
                            <Badge key={k} variant="outline" className="text-[10px]">
                              {CANAL_LABEL[k]}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {prog.total ? (
                        <div className="space-y-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full bg-primary" style={{ width: `${(prog.feitas / prog.total) * 100}%` }} />
                          </div>
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                            {prog.feitas}/{prog.total} tarefas
                          </p>
                        </div>
                      ) : null}
                      {proxima ? (
                        <p className="line-clamp-2">
                          <span className="text-muted-foreground">Próxima:</span> {proxima.title}
                          {proxima.assignee ? <span className="text-muted-foreground"> · {proxima.assignee}</span> : null}
                        </p>
                      ) : null}
                      {atrasadas ? (
                        <p className="flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </section>
          );
        })}
      </div>

      {comContas.some((x) => x.c.status === 'CANCELLED') ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Canceladas</summary>
          <ul className="mt-2 space-y-1">
            {comContas
              .filter((x) => x.c.status === 'CANCELLED')
              .map(({ c }) => (
                <li key={c.id}>
                  <Link href={`/marketing/${c.id}`} className="hover:underline">
                    {c.title}
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
