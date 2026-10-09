import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Pencil } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog, SubmitButton } from '@/components/action-form';
import { CamposCampanha, CamposTarefa } from '@/components/marketing/campos';
import { TextoMarcado } from '@/components/marketing/texto-marcado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  alternarTarefa,
  apagarCampanha,
  apagarTarefa,
  guardarCampanha,
  guardarTarefa,
  moverTarefa,
  mudarEstadoCampanha,
} from '@/lib/actions/marketing';
import { diaEmLisboa } from '@/lib/datas';
import { atrasada, CANAL_LABEL, ESTADOS, ESTADO_LABEL, progresso } from '@/lib/marketing/contas';
import { getCampanha, resultadosDosCupoes } from '@/lib/marketing/consultas';
import { formatMoney } from '@/lib/money';
import { exigirMarketing } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const EUR = { currency: 'EUR', locale: 'pt-PT' };
const diaDe = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const diaCurto = (d: string) => d.split('-').reverse().join('/');

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const eu = await exigirMarketing();
  const { id } = await params;
  const c = await getCampanha(id);
  if (!c) notFound();

  const dono = eu.perfil === 'OWNER';
  const [cupoes] = await Promise.all([resultadosDosCupoes(c.couponCodes, dono)]);
  const hoje = diaEmLisboa(new Date());
  const prog = progresso(c.tasks);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/marketing" className="text-sm text-muted-foreground hover:underline">
          ← Campanhas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
            {c.objective ? <p className="text-sm text-muted-foreground">{c.objective}</p> : null}
          </div>
          <div className="flex items-center">
            <FormDialog
              action={guardarCampanha}
              title="Editar campanha"
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              }
              className="max-h-[90vh] overflow-y-auto"
            >
              <CamposCampanha c={c} />
            </FormDialog>
            <ConfirmDelete
              action={apagarCampanha}
              fields={{ id: c.id }}
              title={`Apagar a campanha "${c.title}"?`}
              description={`As ${c.tasks.length} tarefas vão com ela. Os cupões e as encomendas não mudam.`}
            />
          </div>
        </div>
        {/* O estado num toque. */}
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <ActionForm key={e} action={mudarEstadoCampanha} showSuccess={false} className="space-y-0">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="status" value={e} />
              <Button type="submit" size="sm" variant={c.status === e ? 'default' : 'outline'} disabled={c.status === e}>
                {ESTADO_LABEL[e]}
              </Button>
            </ActionForm>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              Tarefas{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {prog.feitas}/{prog.total} feitas
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {c.tasks.length === 0 ? <p className="px-6 text-sm text-muted-foreground">Ainda sem tarefas.</p> : null}
            <ul className="divide-y">
              {c.tasks.map((t, n) => {
                const prazo = diaDe(t.dueAt);
                const atraso = atrasada({ done: t.done, dueAt: prazo }, hoje);
                return (
                  <li key={t.id} className="flex items-start gap-2 px-4 py-3 sm:px-6">
                    <ActionForm action={alternarTarefa} showSuccess={false} className="space-y-0">
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="mt-0.5 text-muted-foreground hover:text-primary"
                        aria-label={t.done ? 'Marcar por fazer' : 'Marcar feita'}
                      >
                        {t.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}
                      </button>
                    </ActionForm>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', t.done && 'text-muted-foreground line-through')}>{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.assignee ? t.assignee : 'sem responsável'}
                        {prazo ? (
                          <span className={cn(atraso && 'font-medium text-red-700 dark:text-red-400')}>
                            {' '}
                            · até {diaCurto(prazo)}
                            {atraso ? ' (atrasada)' : ''}
                          </span>
                        ) : null}
                      </p>
                      {t.notes ? <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{t.notes}</p> : null}
                    </div>
                    <div className="flex items-center">
                      <ActionForm action={moverTarefa} showSuccess={false} className="space-y-0">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="sentido" value="cima" />
                        <Button type="submit" variant="ghost" size="sm" disabled={n === 0} className="text-muted-foreground">
                          <ArrowUp className="h-4 w-4" />
                          <span className="sr-only">Subir</span>
                        </Button>
                      </ActionForm>
                      <ActionForm action={moverTarefa} showSuccess={false} className="space-y-0">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="sentido" value="baixo" />
                        <Button type="submit" variant="ghost" size="sm" disabled={n === c.tasks.length - 1} className="text-muted-foreground">
                          <ArrowDown className="h-4 w-4" />
                          <span className="sr-only">Descer</span>
                        </Button>
                      </ActionForm>
                      <FormDialog action={guardarTarefa} title="Editar tarefa">
                        <CamposTarefa t={t} />
                      </FormDialog>
                      <ConfirmDelete action={apagarTarefa} fields={{ id: t.id }} title="Apagar esta tarefa?" description={t.title} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t p-4 sm:px-6">
              <ActionForm action={guardarTarefa} className="space-y-3">
                <p className="text-sm font-medium">Juntar tarefa</p>
                <CamposTarefa campaignId={c.id} />
                <SubmitButton variant="outline">Juntar</SubmitButton>
              </ActionForm>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Período:</span>{' '}
                {c.startsAt ? diaCurto(diaDe(c.startsAt)!) : '—'} → {c.endsAt ? diaCurto(diaDe(c.endsAt)!) : '—'}
              </p>
              {c.budget != null ? (
                <p>
                  <span className="text-muted-foreground">Orçamento:</span> {formatMoney(Number(c.budget), EUR)}
                </p>
              ) : null}
              {c.channels.length ? (
                <div className="flex flex-wrap gap-1">
                  {c.channels.map((k) => (
                    <Badge key={k} variant="outline">
                      {CANAL_LABEL[k]}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <TextoMarcado texto={c.description} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cupões</CardTitle>
              <CardDescription>
                Encomendas (não canceladas) que usaram cada código. Os cupões cria-os o dono, em
                Loja → Cupões.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {cupoes.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Sem códigos. Junte-os em Editar.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Encomendas</TableHead>
                      <TableHead className="text-right">Descontado</TableHead>
                      {dono ? <TableHead className="text-right">Vendido</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cupoes.map((r) => (
                      <TableRow key={r.codigo}>
                        <TableCell>
                          <span className="font-mono">{r.codigo}</span>
                          {!r.existe ? (
                            <span className="block text-xs text-amber-700 dark:text-amber-400">por criar (pedir ao dono)</span>
                          ) : !r.ativo ? (
                            <span className="block text-xs text-muted-foreground">desligado</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.encomendas}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.descontado, EUR)}</TableCell>
                        {dono ? <TableCell className="text-right tabular-nums">{formatMoney(r.vendido ?? 0, EUR)}</TableCell> : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
