import Link from 'next/link';
import { Cake, MessageCircle, Phone, Star } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { Lembrete, NovoLembrete } from '@/components/posvenda/lembretes';
import { RegistarOpiniao } from '@/components/posvenda/registar-opiniao';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { registerNoAnswer, skipFollowUp } from '@/lib/actions/posvenda';
import { num } from '@/lib/mappers';
import {
  DIAS_ANTES_ANIVERSARIO,
  daysUntilBirthday,
  mensagemPosVenda,
  firstName,
  linkWhatsApp,
  listProducts,
  MENSAGEM_POS_VENDA,
} from '@/lib/pricing/clientes';
import { nowInLisbon, toLocalInput } from '@/lib/pricing/encomendas';
import {
  getBirthdayCustomers,
  getOpenReminders,
  getPendingFollowUps,
  getRecentFeedback,
  getRecentlyDoneReminders,
  getSettings,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

const diaEntregaFmt = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const diaFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Lisbon',
});

export default async function PosVendaPage() {
  const [pendentes, lembretes, feitos, aniversariantes, opinioes, settings] = await Promise.all([
    getPendingFollowUps(),
    getOpenReminders(),
    getRecentlyDoneReminders(5),
    getBirthdayCustomers(),
    getRecentFeedback(8),
    getSettings(),
  ]);

  const agora = new Date();
  const hoje = nowInLisbon();
  const hojeIso = toLocalInput(hoje).slice(0, 10);
  const loja = settings.businessName || 'nossa casa';
  const modelo = settings.followUpMessage || MENSAGEM_POS_VENDA;

  const paraHoje = pendentes.filter((e) => e.followUpDueAt! <= agora);
  const proximos = pendentes.filter((e) => e.followUpDueAt! > agora);

  const anos = aniversariantes
    .map((c) => ({ c, faltam: daysUntilBirthday(c.birthDay!, c.birthMonth!, hoje) }))
    .filter((x) => x.faltam <= DIAS_ANTES_ANIVERSARIO)
    .sort((a, b) => a.faltam - b.faltam);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pós-venda e lembretes
            <AjudaLink secao="pos-venda" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Perguntar se gostou, lembrar aniversários, e o que mais houver a fazer. Só
            aparecem clientes que aceitaram ser contactados.
          </p>
        </div>
        <NovoLembrete hojeIso={hojeIso} rotulo="Novo lembrete" />
      </header>

      {/* ------------------------------------------------ a contactar */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          A contactar{' '}
          <span className="text-sm font-normal text-muted-foreground">({paraHoje.length})</span>
        </h2>
        {paraHoje.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Ninguém para contactar hoje.
            {proximos.length > 0 ? ` ${proximos.length} nos próximos dias.` : ''}
          </p>
        ) : (
          <ul className="space-y-3">
            {paraHoje.map((e) => {
              const cliente = e.customer!;
              const produtos = e.lines.map((l) => ({ name: l.recipe.name, qty: num(l.qty) }));
              const mensagem = mensagemPosVenda(
                modelo,
                {
                  nome: firstName(cliente.name),
                  loja,
                  produtos: listProducts(produtos),
                  dia: diaEntregaFmt.format(e.dueAt),
                },
                settings.googleReviewUrl,
              );
              return (
                <li key={e.id}>
                  <Card>
                    <CardContent className="space-y-3 p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/clientes/${cliente.id}`}
                              className="font-medium hover:underline"
                            >
                              {cliente.name}
                            </Link>
                            <Link
                              href={`/encomendas/${e.id}`}
                              className="text-muted-foreground hover:underline"
                            >
                              #{e.number}
                            </Link>
                            {e.followUpAttempts > 0 ? (
                              <Badge variant="outline">
                                {e.followUpAttempts}× sem resposta
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground">
                            Entregue {e.deliveredAt ? diaFmt.format(e.deliveredAt) : ''} ·{' '}
                            {listProducts(produtos)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {cliente.phone ? (
                          <>
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={linkWhatsApp(cliente.phone, mensagem)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle className="h-4 w-4" />
                                WhatsApp
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <a href={`tel:${cliente.phone.replace(/\s/g, '')}`}>
                                <Phone className="h-4 w-4" />
                                Ligar
                              </a>
                            </Button>
                          </>
                        ) : (
                          <span className="self-center text-muted-foreground">Sem telefone</span>
                        )}
                        <RegistarOpiniao
                          orderId={e.id}
                          numero={e.number}
                          cliente={firstName(cliente.name)}
                          linhas={e.lines.map((l) => ({ id: l.id, name: l.recipe.name }))}
                        />
                        <ActionForm action={registerNoAnswer} showSuccess={false} className="space-y-0">
                          <input type="hidden" name="orderId" value={e.id} />
                          <SubmitButton size="sm" variant="ghost">
                            Não atendeu
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={skipFollowUp} showSuccess={false} className="space-y-0">
                          <input type="hidden" name="orderId" value={e.id} />
                          <SubmitButton size="sm" variant="ghost" className="text-muted-foreground">
                            Não contactar
                          </SubmitButton>
                        </ActionForm>
                      </div>

                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Ver a mensagem</summary>
                        <p className="mt-1 whitespace-pre-line rounded-md bg-muted/60 p-2">
                          {mensagem}
                        </p>
                      </details>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {proximos.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Nos próximos dias:{' '}
            {proximos.map((e, i) => (
              <span key={e.id}>
                {i > 0 ? ' · ' : ''}
                <Link href={`/encomendas/${e.id}`} className="hover:underline">
                  {e.customer!.name}
                </Link>{' '}
                ({diaFmt.format(e.followUpDueAt!)})
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------ lembretes */}
        <Card>
          <CardHeader>
            <CardTitle>Lembretes</CardTitle>
            <CardDescription>Escritos à mão: o que fazer e quando.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lembretes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada por fazer.</p>
            ) : (
              <ul className="space-y-2">
                {lembretes.map((r) => (
                  <Lembrete key={r.id} r={r} hoje={hoje} />
                ))}
              </ul>
            )}
            {feitos.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Feitos recentemente
                </summary>
                <ul className="mt-2 space-y-2">
                  {feitos.map((r) => (
                    <Lembrete key={r.id} r={r} hoje={hoje} />
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ aniversarios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="h-4 w-4 text-primary" aria-hidden />
              Aniversários
            </CardTitle>
            <CardDescription>
              Nos próximos {DIAS_ANTES_ANIVERSARIO} dias, de quem aceitou ser contactado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {anos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ninguém faz anos esta semana. Os aniversários escrevem-se na ficha de cada
                cliente.
              </p>
            ) : (
              <ul className="space-y-2">
                {anos.map(({ c, faltam }) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <Badge variant={faltam === 0 ? 'warning' : 'secondary'}>
                        {faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`}
                      </Badge>
                    </span>
                    {c.phone ? (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={linkWhatsApp(c.phone)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------ opinioes */}
      {opinioes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" aria-hidden />
              Últimas opiniões
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {opinioes.map((e) => (
                <li key={e.id} className="space-y-0.5 px-6 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.rating} ★</span>
                    {e.customer ? (
                      <Link href={`/clientes/${e.customer.id}`} className="font-medium hover:underline">
                        {e.customer.name}
                      </Link>
                    ) : null}
                    <Link href={`/encomendas/${e.id}`} className="text-muted-foreground hover:underline">
                      #{e.number}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {e.feedbackAt ? diaFmt.format(e.feedbackAt) : ''}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.lines
                      .map((l) => `${l.recipe.name}${l.rating !== null ? ` ${l.rating}★` : ''}`)
                      .join(' · ')}
                  </p>
                  {e.feedbackComment ? <p className="italic">“{e.feedbackComment}”</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
