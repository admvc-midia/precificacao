import Link from 'next/link';
import { CalendarPlus, ChevronLeft, ChevronRight, MessageSquareText, NotebookPen, PackagePlus } from 'lucide-react';

import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import {
  alterarEvento,
  apagarEvento,
  criarEvento,
  guardarPlano,
  guardarRevisao,
  tirarDoPlano,
} from '@/lib/actions/calendario';
import { eventosDoIntervalo, produtosParaPlano, vendasNosDias, type VendasDoDia } from '@/lib/calendario/consultas';
import {
  ACAO_LABEL,
  diaNoAnoAnterior,
  semanasDoMes,
  somarMeses,
  TIPO_LABEL,
  type Ocorrencia,
  type Plano,
} from '@/lib/calendario/eventos';
import { diaEmLisboa } from '@/lib/datas';
import { utilizadorAtual } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Os dias sao AAAA-MM-DD sem hora: lidos como meia-noite UTC e mostrados em UTC.
const utc = (dia: string) => new Date(`${dia}T00:00:00Z`);
const nomeDoMes = new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const nomeDoDia = new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const curto = new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });

/** A cor de cada coisa no calendario: feriado, data conhecida, ou do dono. */
function corDe(o: Ocorrencia): string {
  if (o.feriado) return 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200';
  if (o.tipo === 'KNOWN') return 'bg-secondary text-secondary-foreground';
  if (o.tipo === 'TEAM') return 'bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200';
  if (o.tipo === 'TREND') return 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200';
  return 'bg-primary/15 text-foreground';
}

/** Os campos que dizem a action de que evento se trata. */
function Ref({ o }: { o: Ocorrencia }) {
  return o.eventoId ? (
    <input type="hidden" name="eventoId" value={o.eventoId} />
  ) : (
    <input type="hidden" name="chave" value={o.chave ?? ''} />
  );
}

function SeloDoPlano({ p }: { p: Plano }) {
  const variante = p.acao === 'NONE' ? 'destructive' : p.acao === 'MORE' ? 'success' : 'warning';
  return (
    <Badge variant={variante} className="shrink-0">
      {ACAO_LABEL[p.acao]}
      {p.qty ? ` · ${p.qty}` : ''}
    </Badge>
  );
}

function Vendas({ titulo, v }: { titulo: string; v: VendasDoDia }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{titulo}: </span>
      {v.encomendas} {v.encomendas === 1 ? 'encomenda' : 'encomendas'}
      {v.produtos.length > 0 ? (
        <span className="text-muted-foreground">
          {' '}
          — {v.produtos.map((p) => `${p.nome} (${p.qtd.toLocaleString('pt-PT')})`).join(', ')}
        </span>
      ) : null}
    </p>
  );
}

function CamposDoEvento({ o }: { o?: Ocorrencia }) {
  return (
    <>
      <Field label="Nome" htmlFor="title">
        <Input id="title" name="title" defaultValue={o?.titulo ?? ''} placeholder="Feira de Natal da escola" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dia" htmlFor="day">
          <Input id="day" name="day" type="date" defaultValue={o?.dia ?? ''} required />
        </Field>
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={o?.tipo === 'KNOWN' ? 'EVENT' : (o?.tipo ?? 'EVENT')}>
            <option value="EVENT">Evento (festa, feira, encomenda grande)</option>
            <option value="TREND">Tendência (algo na moda)</option>
            <option value="TEAM">Equipa (folga, férias, formação)</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="yearly" defaultChecked={o?.anual ?? false} className="h-4 w-4" />
        Repete todos os anos neste dia
      </label>
      <Field label="Notas para a equipa" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={o?.notas ?? ''} rows={3} />
      </Field>
    </>
  );
}

function CartaoDoEvento({
  o,
  dono,
  hoje,
  vendas,
  produtos,
}: {
  o: Ocorrencia;
  dono: boolean;
  hoje: string;
  vendas: Map<string, VendasDoDia>;
  produtos: Array<{ id: string; nome: string }>;
}) {
  const anterior = diaNoAnoAnterior(o);
  const vendasDoDia = o.dia <= hoje ? vendas.get(o.dia) : undefined;
  const vendasAntes = anterior ? vendas.get(anterior) : undefined;
  const ano = Number(o.dia.slice(0, 4));
  const revisaoDoAno = o.revisoes.find((r) => r.ano === ano);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', corDe(o))} aria-hidden />
        <h3 className="font-semibold">{o.titulo}</h3>
        {o.paises.map((p) => (
          <Badge key={p} variant="outline" className="px-1.5 py-0 text-[10px]">
            {p}
          </Badge>
        ))}
        {o.feriado ? <Badge variant="destructive">Feriado</Badge> : null}
        {o.tipo !== 'KNOWN' ? <Badge variant="secondary">{TIPO_LABEL[o.tipo]}</Badge> : null}
        {o.tipo !== 'KNOWN' && o.anual ? <span className="text-xs text-muted-foreground">todos os anos</span> : null}
      </div>

      {o.notaFixa ? <p className="text-sm text-muted-foreground">{o.notaFixa}</p> : null}
      {o.notas ? <p className="whitespace-pre-line text-sm">{o.notas}</p> : null}

      {o.planos.length > 0 ? (
        <ul className="space-y-1.5">
          {o.planos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <SeloDoPlano p={p} />
              <span className="font-medium">{p.produto}</span>
              {p.nota ? <span className="truncate text-muted-foreground">— {p.nota}</span> : null}
              {dono ? (
                <span className="ml-auto">
                  <ConfirmDelete
                    action={tirarDoPlano}
                    fields={{ id: p.id }}
                    title={`Tirar ${p.produto} do plano?`}
                    confirmLabel="Tirar"
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {vendasDoDia ? <Vendas titulo="Neste dia" v={vendasDoDia} /> : null}
      {anterior && vendasAntes ? <Vendas titulo={`Em ${anterior.slice(0, 4)} (${curto.format(utc(anterior))})`} v={vendasAntes} /> : null}

      {o.revisoes.length > 0 ? (
        <div className="space-y-1 border-l-2 border-primary/30 pl-3">
          {o.revisoes.map((r) => (
            <p key={r.ano} className="whitespace-pre-line text-sm">
              <span className="font-medium">Como correu em {r.ano}:</span> {r.texto}
            </p>
          ))}
        </div>
      ) : null}

      {dono ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <FormDialog
            action={guardarPlano}
            title={`Plano · ${o.titulo}`}
            description={o.anual ? 'Vale para esta data todos os anos.' : undefined}
            submitLabel="Guardar no plano"
            trigger={
              <Button variant="outline" size="sm">
                <PackagePlus className="h-4 w-4" />
                Plano de produção
              </Button>
            }
          >
            <Ref o={o} />
            <Field label="Produto" htmlFor="recipeId">
              <Select id="recipeId" name="recipeId" defaultValue="" required>
                <option value="" disabled>
                  Escolha…
                </option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="O que fazer" htmlFor="action">
                <Select id="action" name="action" defaultValue="MORE">
                  <option value="MORE">Produzir mais</option>
                  <option value="LESS">Produzir menos</option>
                  <option value="NONE">Não produzir</option>
                </Select>
              </Field>
              <Field label="Quantas (opcional)" htmlFor="qty">
                <Input id="qty" name="qty" inputMode="numeric" placeholder="30" />
              </Field>
            </div>
            <Field label="Nota (opcional)" htmlFor="note">
              <Input id="note" name="note" placeholder="Fazer na véspera" />
            </Field>
          </FormDialog>

          {o.tipo === 'KNOWN' ? (
            <FormDialog
              action={alterarEvento}
              title={`Notas · ${o.titulo}`}
              description="Para a equipa. Valem para esta data todos os anos."
              trigger={
                <Button variant="outline" size="sm">
                  <NotebookPen className="h-4 w-4" />
                  Notas
                </Button>
              }
            >
              <Ref o={o} />
              <Field label="Notas para a equipa" htmlFor="notes">
                <Textarea id="notes" name="notes" defaultValue={o.notas ?? ''} rows={4} />
              </Field>
            </FormDialog>
          ) : (
            <FormDialog
              action={alterarEvento}
              title="Alterar evento"
              trigger={
                <Button variant="outline" size="sm">
                  <NotebookPen className="h-4 w-4" />
                  Alterar
                </Button>
              }
            >
              <Ref o={o} />
              <CamposDoEvento o={o} />
            </FormDialog>
          )}

          {o.dia <= hoje ? (
            <FormDialog
              action={guardarRevisao}
              title={`Como correu · ${o.titulo} ${ano}`}
              description="O que vendeu bem, o que sobrou, o que mudar no próximo ano. Vazio apaga."
              trigger={
                <Button variant="outline" size="sm">
                  <MessageSquareText className="h-4 w-4" />
                  Como correu
                </Button>
              }
            >
              <Ref o={o} />
              <input type="hidden" name="ano" value={ano} />
              <Textarea name="text" defaultValue={revisaoDoAno?.texto ?? ''} rows={5} aria-label="Como correu" />
            </FormDialog>
          ) : null}

          {o.tipo !== 'KNOWN' && o.eventoId ? (
            <ConfirmDelete
              action={apagarEvento}
              fields={{ eventoId: o.eventoId }}
              title={`Apagar "${o.titulo}"?`}
              description="Apaga o evento, o plano e as notas de como correu."
              confirmLabel="Apagar"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const eu = await utilizadorAtual();
  const dono = eu?.perfil === 'OWNER';
  const hoje = diaEmLisboa(new Date());
  const pedido = (await searchParams).mes ?? '';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hoje.slice(0, 7);

  const semanas = semanasDoMes(mes);
  const ocorrencias = await eventosDoIntervalo(semanas[0][0], semanas[semanas.length - 1][6]);
  const doMes = ocorrencias.filter((o) => o.dia.startsWith(mes));
  const dias = doMes.flatMap((o) => [o.dia <= hoje ? o.dia : null, diaNoAnoAnterior(o)]).filter((d): d is string => Boolean(d));
  const [vendas, produtos] = await Promise.all([vendasNosDias(dias), dono ? produtosParaPlano() : Promise.resolve([])]);

  const porDia = new Map<string, Ocorrencia[]>();
  for (const o of ocorrencias) porDia.set(o.dia, [...(porDia.get(o.dia) ?? []), o]);
  const diasDoMes = [...new Set(doMes.map((o) => o.dia))];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Calendário de produção
            <AjudaLink secao="calendario" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Feriados, datas que vendem e os seus eventos — com o que produzir em cada um.
          </p>
        </div>
        {dono ? (
          <FormDialog
            action={criarEvento}
            title="Novo evento"
            submitLabel="Criar"
            trigger={
              <Button>
                <CalendarPlus className="h-4 w-4" />
                Novo evento
              </Button>
            }
          >
            <CamposDoEvento />
          </FormDialog>
        ) : null}
      </header>

      <nav className="flex items-center justify-between gap-2" aria-label="Mês">
        <Link href={`/calendario?mes=${somarMeses(mes, -1)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Anterior</span>
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold first-letter:uppercase">{nomeDoMes.format(utc(`${mes}-01`))}</h2>
          {mes !== hoje.slice(0, 7) ? (
            <Link href="/calendario" className="text-sm text-primary hover:underline">
              Hoje
            </Link>
          ) : null}
        </div>
        <Link href={`/calendario?mes=${somarMeses(mes, 1)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <span className="sr-only sm:not-sr-only">Seguinte</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </nav>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
            {SEMANA.map((s) => (
              <div key={s} className="pb-2">
                {s}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
            {semanas.flat().map((dia) => {
              const doDia = porDia.get(dia) ?? [];
              const fora = !dia.startsWith(mes);
              const eHoje = dia === hoje;
              const temFeriado = doDia.some((o) => o.feriado);
              return (
                <div
                  key={dia}
                  className={cn(
                    'min-h-14 bg-card p-1 sm:min-h-24 sm:p-1.5',
                    fora && 'bg-muted/40 text-muted-foreground',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                        eHoje && 'bg-primary font-semibold text-primary-foreground',
                        !eHoje && temFeriado && !fora && 'font-semibold text-red-700 dark:text-red-400',
                      )}
                    >
                      {Number(dia.slice(8))}
                    </span>
                  </div>
                  {/* Telemovel: so pontos; o nome esta na lista de baixo. */}
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {doDia.map((o) => (
                      <span key={o.chaveUnica} className={cn('h-1.5 w-1.5 rounded-full', corDe(o))} />
                    ))}
                  </div>
                  <ul className="mt-1 hidden space-y-0.5 sm:block">
                    {doDia.slice(0, 3).map((o) => (
                      <li key={o.chaveUnica}>
                        <a
                          href={`#d-${dia}`}
                          title={o.titulo}
                          className={cn('block truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight', corDe(o), fora && 'opacity-60')}
                        >
                          {o.planos.length > 0 ? '● ' : ''}
                          {o.titulo}
                        </a>
                      </li>
                    ))}
                    {doDia.length > 3 ? <li className="px-1 text-[11px] text-muted-foreground">+{doDia.length - 3}</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-200 dark:bg-red-900" />Feriado</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-secondary" />Data que vende</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary/30" />Evento</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-200 dark:bg-amber-900" />Tendência</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-200 dark:bg-sky-900" />Equipa</span>
            <span>● tem plano de produção</span>
          </p>
        </CardContent>
      </Card>

      <section className="space-y-5">
        {diasDoMes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada marcado neste mês.</p>
        ) : null}
        {diasDoMes.map((dia) => (
          <div key={dia} id={`d-${dia}`} className="scroll-mt-20 space-y-2">
            <h3
              className={cn(
                'text-sm font-semibold first-letter:uppercase',
                dia === hoje && 'text-primary',
                dia < hoje && 'text-muted-foreground',
              )}
            >
              {nomeDoDia.format(utc(dia))}
              {dia === hoje ? ' · hoje' : ''}
            </h3>
            {(porDia.get(dia) ?? []).map((o) => (
              <CartaoDoEvento key={o.chaveUnica} o={o} dono={dono} hoje={hoje} vendas={vendas} produtos={produtos} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
