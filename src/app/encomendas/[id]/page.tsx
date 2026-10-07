import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarClock,
  Check,
  ChefHat,
  CreditCard,
  MessageCircle,
  Phone,
  RotateCcw,
  Star,
  User,
  X,
} from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  FormDialog,
  SubmitButton,
} from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CartaoInfo } from '@/components/cartao-info';
import { StatTile } from '@/components/dre-breakdown';
import { Alert, Badge, Separator } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNum,
  TableRow,
} from '@/components/ui/table';
import {
  addCustomerOrderLine,
  deleteCustomerOrder,
  deleteCustomerOrderLine,
  produceCustomerOrders,
  setCustomerOrderPayment,
  setCustomerOrderStatus,
  updateCustomerOrder,
  updateCustomerOrderLine,
} from '@/lib/actions/encomendas';
import { updateCustomer } from '@/lib/actions/clientes';
import { num, toChannelInput } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  nowInLisbon,
  orderResult,
  PAGAMENTO_LABEL,
  PROXIMO_ESTADO,
  relativeDay,
  STATUS_LABEL,
  toLocalInput,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/pricing/encomendas';
import { linkWhatsApp, VIA_LABEL } from '@/lib/pricing/clientes';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getChannels, getCostedRecipes, getCustomerOrder } from '@/lib/queries';
import { exigirSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** O caminho normal de uma encomenda, pela ordem. Cancelada fica fora. */
const ETAPAS: OrderStatus[] = ['REQUESTED', 'IN_PRODUCTION', 'READY', 'DELIVERED'];

/** O texto do botao que leva ao estado seguinte. */
const ACAO_SEGUINTE: Partial<Record<OrderStatus, string>> = {
  REQUESTED: 'Começar a produzir',
  IN_PRODUCTION: 'Está pronta',
  READY: 'Marcar como entregue',
};

const dataFmt = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
const diaFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' });

type Encomenda = NonNullable<Awaited<ReturnType<typeof getCustomerOrder>>>;

export default async function EncomendaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eu = await exigirSessao();
  // A cozinha tem a sua vista, sem um unico valor. E outra pagina, e nao a
  // mesma com partes escondidas: assim nao ha como um preco escapar.
  if (eu.perfil !== 'OWNER') {
    const so = await getCustomerOrder(id);
    if (!so) notFound();
    return <EncomendaCozinha e={so} />;
  }

  const [e, { recipes, settings, currency, channels }, canais] = await Promise.all([
    getCustomerOrder(id),
    getCostedRecipes(),
    getChannels(),
  ]);
  if (!e) notFound();

  const r = orderResult(
    {
      lines: e.lines.map((l) => ({
        qty: num(l.qty),
        unitPrice: num(l.unitPrice),
        listPrice: l.listPrice === null ? null : num(l.listPrice),
        unitFoodCost: num(l.unitFoodCost),
        unitPackagingCost: num(l.unitPackagingCost),
        unitDeliveryPackagingCost: num(l.unitDeliveryPackagingCost),
      })),
      fulfillment: e.fulfillment,
      paymentMethod: e.paymentMethod,
      channel: e.channel ? toChannelInput(e.channel) : null,
    },
    settings,
  );

  const ref = referenceChannel(channels);
  const produtos = recipes
    .filter((x) => x.kind === 'PRODUCT' && !x.error)
    .map((x) => {
      const preco = priceForRecipe(x, ref, settings);
      return {
        id: x.id,
        name: x.name,
        listPrice: preco?.feasible && preco.price > 0 ? preco.price : null,
      };
    });

  const agora = nowInLisbon();
  const aberta = e.status !== 'DELIVERED' && e.status !== 'CANCELLED';
  const atrasada = aberta && e.dueAt < agora;
  const dia = relativeDay(e.dueAt, agora);
  const temLinhas = e.lines.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/encomendas" className="text-sm text-muted-foreground hover:underline">
            Encomendas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            #{e.number} · {e.customer?.name ?? 'Sem cliente'}
            <AjudaLink secao="encomendas" />
          </h1>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="first-letter:uppercase">{dataFmt.format(e.dueAt)}</span>
          {atrasada ? (
            <Badge variant="destructive">atrasada</Badge>
          ) : aberta && dia ? (
            <Badge variant="warning">{dia}</Badge>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Total"
          value={formatMoney(r.price, currency)}
          hint={
            r.discount > 0.005
              ? `tabela ${formatMoney(r.listTotal, currency)}, desconto ${formatMoney(r.discount, currency)}`
              : r.discount < -0.005
                ? `acima da tabela em ${formatMoney(-r.discount, currency)}`
                : 'preço de tabela'
          }
        />
        <StatTile
          label="Lucro"
          value={temLinhas ? formatMoney(r.profit, currency) : '—'}
          tone={!temLinhas ? 'default' : r.profit < 0 ? 'critical' : r.netMargin < 0.05 ? 'warning' : 'good'}
          hint={temLinhas ? `${formatPercent(r.netMargin, currency.locale)} da receita sem IVA` : undefined}
        />
        <StatTile
          label="CMV"
          value={temLinhas ? formatPercent(r.cmv, currency.locale) : '—'}
          tone={!temLinhas ? 'default' : r.cmv <= settings.targetCmv ? 'good' : r.cmv <= 0.4 ? 'warning' : 'critical'}
          hint={`Alvo ${formatPercent(settings.targetCmv, currency.locale, 0)}`}
        />
        <StatTile
          label="Custo dos produtos"
          value={formatMoney(r.productCost, currency)}
          hint="Insumos e embalagens, ao preço do dia em que entraram"
        />
      </div>

      <Pipeline e={e} temLinhas={temLinhas} dono />

      {/* ------------------------------------------------ cliente, entrega, pagamento */}
      <div className="grid gap-4 md:grid-cols-3">
        <CartaoInfo
          icon={User}
          titulo="Cliente"
          editar={
            e.customer ? (
              <FormDialog action={updateCustomer} title="Alterar o cliente">
                <input type="hidden" name="id" value={e.customer.id} />
                <input type="hidden" name="consentSubmitted" value="1" />
                <Field label="Nome" htmlFor="cl-nome">
                  <Input id="cl-nome" name="name" defaultValue={e.customer.name} required />
                </Field>
                <Field label="Telefone" htmlFor="cl-tel">
                  <Input id="cl-tel" name="phone" type="tel" defaultValue={e.customer.phone ?? ''} />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="contactConsent"
                    defaultChecked={e.customer.contactConsentAt !== null}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span>
                    Aceita ser contactado depois
                    <span className="block text-xs text-muted-foreground">
                      Se o cliente pedir para não ser contactado, desmarque.
                    </span>
                  </span>
                </label>
              </FormDialog>
            ) : null
          }
        >
          {e.customer ? (
            <>
              <p>
                <Link href={`/clientes/${e.customer.id}`} className="font-medium hover:underline">
                  {e.customer.name}
                </Link>
                {e.customer.likes ? (
                  <span className="block text-xs text-muted-foreground">Gosta: {e.customer.likes}</span>
                ) : null}
              </p>
              {e.customer.phone ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
                    <a href={`tel:${e.customer.phone.replace(/\s/g, '')}`}>
                      <Phone className="h-3.5 w-3.5" />
                      {e.customer.phone}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
                    <a href={linkWhatsApp(e.customer.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Sem telefone</p>
              )}
              <p className="text-xs text-muted-foreground">
                {e.customer.contactConsentAt
                  ? `Aceita contacto depois (desde ${diaFmt.format(e.customer.contactConsentAt)})`
                  : 'Não autorizou contacto depois'}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Sem cliente</p>
          )}
        </CartaoInfo>

        <CartaoInfo
          icon={CalendarClock}
          titulo="Entrega"
          editar={
            <FormDialog
              action={updateCustomerOrder}
              title="Alterar a entrega"
              className="max-h-[90vh] overflow-y-auto"
            >
              <input type="hidden" name="id" value={e.id} />
              <Field label="Dia e hora" htmlFor="ed-dia">
                <Input
                  id="ed-dia"
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(e.dueAt)}
                  required
                />
              </Field>
              <Field label="Como" htmlFor="ed-como">
                <Select id="ed-como" name="fulfillment" defaultValue={e.fulfillment}>
                  <option value="PICKUP">Cliente levanta</option>
                  <option value="DELIVERY">Nós entregamos</option>
                </Select>
              </Field>
              <Field label="Morada" htmlFor="ed-morada" hint="Obrigatória para entregar.">
                <Textarea id="ed-morada" name="address" rows={2} defaultValue={e.address ?? ''} />
              </Field>
              <Field label="Canal" htmlFor="ed-canal">
                <Select id="ed-canal" name="channelId" defaultValue={e.channelId ?? ''}>
                  <option value="">Sem canal</option>
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notas" htmlFor="ed-notas">
                <Textarea id="ed-notas" name="notes" rows={3} defaultValue={e.notes ?? ''} />
              </Field>
            </FormDialog>
          }
        >
          <p className="font-medium first-letter:uppercase">{dataFmt.format(e.dueAt)}</p>
          <p className="text-muted-foreground">
            {e.fulfillment === 'DELIVERY' ? 'Nós entregamos' : 'Cliente levanta'}
            {e.channel ? ` · ${e.channel.name}` : ''}
          </p>
          {e.address ? <p className="whitespace-pre-line">{e.address}</p> : null}
          {e.notes ? (
            <p className="whitespace-pre-line rounded-md bg-muted/60 px-2 py-1.5 text-xs">
              {e.notes}
            </p>
          ) : null}
        </CartaoInfo>

        <CartaoInfo
          icon={CreditCard}
          titulo="Pagamento"
          editar={
            <FormDialog action={setCustomerOrderPayment} title="Pagamento">
              <input type="hidden" name="id" value={e.id} />
              <Field label="Como paga" htmlFor="pag-forma">
                <Select id="pag-forma" name="paymentMethod" defaultValue={e.paymentMethod ?? ''}>
                  <option value="">Ainda não se sabe</option>
                  {(Object.keys(PAGAMENTO_LABEL) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {PAGAMENTO_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="paid"
                  defaultChecked={e.paid}
                  className="h-4 w-4 rounded border-input"
                />
                Já está pago
              </label>
            </FormDialog>
          }
        >
          <p className="flex items-center gap-2">
            {e.paid ? (
              <Badge variant="success">Pago</Badge>
            ) : (
              <Badge variant="warning">Por pagar</Badge>
            )}
            <span className="text-muted-foreground">
              {e.paymentMethod ? PAGAMENTO_LABEL[e.paymentMethod] : 'forma por saber'}
            </span>
          </p>
          <p className="text-2xl font-semibold tabular-nums">{formatMoney(r.gross, currency)}</p>
        </CartaoInfo>
      </div>

      {/* ------------------------------------------------ produtos e contas */}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Produtos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!temLinhas ? (
              <p className="px-6 pb-4 text-sm text-muted-foreground">
                Sem produtos. Junte o primeiro abaixo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Preço un.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.lines.map((l) => {
                    const preco = num(l.unitPrice);
                    const tabela = l.listPrice === null ? null : num(l.listPrice);
                    const diferente = tabela !== null && Math.abs(tabela - preco) > 0.005;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Link
                            href={`/precificacao/${l.recipe.id}`}
                            className="font-medium hover:underline"
                          >
                            {l.recipe.name}
                          </Link>
                        </TableCell>
                        <TableNum>{num(l.qty)}</TableNum>
                        <TableNum>
                          {formatMoney(preco, currency)}
                          {diferente ? (
                            <span className="block text-xs text-muted-foreground line-through">
                              {formatMoney(tabela!, currency)}
                            </span>
                          ) : null}
                        </TableNum>
                        <TableNum className="font-medium">
                          {formatMoney(preco * num(l.qty), currency)}
                        </TableNum>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <FormDialog
                              action={updateCustomerOrderLine}
                              title={l.recipe.name}
                              description="Quantidade e preço combinado. O custo fica o do dia em que a linha entrou."
                            >
                              <input type="hidden" name="id" value={l.id} />
                              <Field label="Quantidade" htmlFor={`lq-${l.id}`}>
                                <Input
                                  id={`lq-${l.id}`}
                                  name="qty"
                                  inputMode="decimal"
                                  defaultValue={String(num(l.qty)).replace('.', ',')}
                                  required
                                />
                              </Field>
                              <Field
                                label="Preço por unidade"
                                htmlFor={`lp-${l.id}`}
                                hint={
                                  tabela !== null
                                    ? `Tabela: ${formatMoney(tabela, currency)}`
                                    : undefined
                                }
                              >
                                <Input
                                  id={`lp-${l.id}`}
                                  name="price"
                                  inputMode="decimal"
                                  defaultValue={preco.toFixed(2).replace('.', ',')}
                                  required
                                />
                              </Field>
                            </FormDialog>
                            <ConfirmDelete
                              action={deleteCustomerOrderLine}
                              fields={{ id: l.id }}
                              title={`Tirar "${l.recipe.name}" da encomenda?`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <div className="border-t p-4 sm:px-6">
              <ActionForm action={addCustomerOrderLine} showSuccess={false} className="space-y-3">
                <input type="hidden" name="orderId" value={e.id} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_5rem_7rem_auto] sm:items-end">
                  <Field label="Juntar produto" htmlFor="add-produto" className="col-span-2 sm:col-span-1">
                    <Select id="add-produto" name="recipeId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.listPrice !== null ? ` — ${formatMoney(p.listPrice, currency)}` : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Qtd." htmlFor="add-qty">
                    <Input id="add-qty" name="qty" inputMode="decimal" defaultValue="1" required />
                  </Field>
                  <Field label="Preço un." htmlFor="add-preco">
                    <Input id="add-preco" name="price" inputMode="decimal" placeholder="tabela" />
                  </Field>
                  <SubmitButton variant="outline" className="col-span-2 sm:col-span-1">
                    Juntar
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
        {e.status === 'DELIVERED' ? <Opiniao e={e} /> : null}
        {temLinhas ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Para onde vai o dinheiro</CardTitle>
              <CardDescription>
                {e.paymentMethod === null
                  ? r.cardFeeApplied
                    ? 'Ainda não se sabe como paga: conta-se com a taxa de cartão, por prudência.'
                    : 'Ainda não se sabe como paga.'
                  : e.paymentMethod === 'CARD'
                    ? 'Pago com cartão: a taxa conta.'
                    : `Pago por ${PAGAMENTO_LABEL[e.paymentMethod]}: sem taxa de cartão.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Linha label="O cliente paga" value={formatMoney(r.gross, currency)} forte />
              <Linha label="IVA" value={`− ${formatMoney(r.vatAmount, currency)}`} />
              <Separator className="my-2" />
              <Linha label="Insumos" value={`− ${formatMoney(r.foodCost, currency)}`} />
              <Linha
                label={r.deliveryPackaging ? 'Embalagens (com a de transporte)' : 'Embalagens'}
                value={`− ${formatMoney(r.packagingCost, currency)}`}
              />
              <Linha
                label={`Custos fixos (${formatPercent(settings.fixedCostRate, currency.locale, 0)})`}
                value={`− ${formatMoney(r.fixedCost, currency)}`}
              />
              {r.cardFee > 0 ? (
                <Linha label="Taxa de cartão" value={`− ${formatMoney(r.cardFee, currency)}`} />
              ) : null}
              {r.platformFee > 0 ? (
                <Linha label="Comissão do canal" value={`− ${formatMoney(r.platformFee, currency)}`} />
              ) : null}
              {r.deliveryCost > 0 ? (
                <Linha label="Entrega" value={`− ${formatMoney(r.deliveryCost, currency)}`} />
              ) : null}
              <Separator className="my-2" />
              <Linha
                label="Lucro"
                value={formatMoney(r.profit, currency)}
                forte
                className={r.profit < 0 ? 'text-destructive' : undefined}
              />
              {settings.fixedCostRate === 0 ? (
                <Alert tone="warning" className="mt-3">
                  Os custos fixos estão a 0% nas Configurações: este lucro está mais alto do
                  que o real.
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        </div>
      </div>

      <ConfirmDelete
        action={deleteCustomerOrder}
        fields={{ id: e.id }}
        title={`Apagar a encomenda #${e.number}?`}
        description="Some de vez, e deixa de contar nos Resultados do mês. Para uma encomenda que o cliente desmarcou, prefira Cancelar."
        confirmLabel="Apagar"
        trigger={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            Apagar encomenda
          </Button>
        }
      />
    </div>
  );
}

/**
 * O que o cliente achou: a nota e o comentario, ou em que pe esta o
 * pos-venda. O registo faz-se na pagina de Pos-venda, que e onde esta a
 * mensagem pronta e a lista do dia.
 */
function Opiniao({ e }: { e: Encomenda }) {
  const comNota = e.lines.filter((l) => l.rating !== null);
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" aria-hidden />
          Opinião do cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {e.feedbackAt ? (
          <>
            <p className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{e.rating} ★</span>
              <span className="text-muted-foreground">
                {e.feedbackVia ? VIA_LABEL[e.feedbackVia] : ''}, {diaFmt.format(e.feedbackAt)}
              </span>
            </p>
            {e.feedbackComment ? <p className="italic">“{e.feedbackComment}”</p> : null}
            {comNota.length > 0 ? (
              <ul className="space-y-0.5 text-muted-foreground">
                {comNota.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>{l.recipe.name}</span>
                    <span>{l.rating} ★</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : e.followUpDueAt ? (
          <p className="text-muted-foreground">
            Pós-venda marcado para {diaFmt.format(e.followUpDueAt)}
            {e.followUpAttempts > 0 ? ` (${e.followUpAttempts} tentativa(s) sem resposta)` : ''}.{' '}
            <Link href="/pos-venda" className="text-primary hover:underline">
              Ir ao pós-venda
            </Link>
          </p>
        ) : (
          <p className="text-muted-foreground">
            {e.customer?.contactConsentAt
              ? 'Sem pós-venda marcado.'
              : 'O cliente não autorizou contacto depois da encomenda.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * O caminho da encomenda: Pedida → Em produção → Pronta → Entregue.
 *
 * Cada etapa e um botao — tocar numa etapa leva a encomenda para la, para a
 * frente ou para tras (corrigir um engano). O botao grande faz o passo
 * seguinte, que e o que se carrega nove vezes em dez.
 */
function Pipeline({ e, temLinhas, dono }: { e: Encomenda; temLinhas: boolean; dono: boolean }) {
  const cancelada = e.status === 'CANCELLED';
  const atual = ETAPAS.indexOf(e.status);
  const seguinte = PROXIMO_ESTADO[e.status];

  /** Linha de baixo de cada etapa: a data, ou a ordem de producao. */
  function detalhe(s: OrderStatus) {
    if (s === 'IN_PRODUCTION' && e.productionOrder) {
      return (
        <Link href={`/producao/${e.productionOrder.id}`} className="text-primary hover:underline">
          ver a ordem
        </Link>
      );
    }
    if (s === 'DELIVERED' && e.deliveredAt) return diaFmt.format(e.deliveredAt);
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <ol className={cn('grid grid-cols-4', cancelada && 'opacity-40')}>
          {ETAPAS.map((s, i) => {
            const feita = !cancelada && i < atual;
            const agora = !cancelada && i === atual;
            return (
              <li key={s} className="relative flex flex-col items-center text-center">
                {/* O traco ate a etapa seguinte, cheio se ja la se passou. */}
                {i < ETAPAS.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-1/2 top-4 h-0.5 w-full',
                      !cancelada && i < atual ? 'bg-primary' : 'bg-border',
                    )}
                  />
                ) : null}
                <ActionForm action={setCustomerOrderStatus} showSuccess={false} className="space-y-0">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    // Uma cancelada so o dono a reabre (a action tambem o exige).
                    disabled={agora || (s === 'DELIVERED' && !temLinhas) || (cancelada && !dono)}
                    title={agora ? STATUS_LABEL[s] : `Mudar para ${STATUS_LABEL[s]}`}
                    className={cn(
                      'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                      feita && 'border-primary bg-primary text-primary-foreground',
                      agora && 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20',
                      !feita && !agora && 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary',
                      'disabled:cursor-default',
                    )}
                  >
                    {/* Entregue e o fim do caminho: quando la esta, esta feito. */}
                    {feita || (agora && s === 'DELIVERED') ? <Check className="h-4 w-4" /> : i + 1}
                    <span className="sr-only">{STATUS_LABEL[s]}</span>
                  </button>
                </ActionForm>
                <span
                  className={cn(
                    'mt-2 text-xs leading-tight sm:text-sm',
                    agora ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {STATUS_LABEL[s]}
                </span>
                <span className="text-[11px] text-muted-foreground">{detalhe(s)}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {cancelada
              ? 'Encomenda cancelada. Não conta nos resultados.'
              : e.status === 'DELIVERED'
                ? 'Entregue: conta nos Resultados do mês.'
                : 'Só conta como venda quando for entregue.'}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {cancelada ? (
              dono ? (
              <ActionForm action={setCustomerOrderStatus} showSuccess={false} className="space-y-0">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="REQUESTED" />
                <SubmitButton variant="outline" className="w-full sm:w-auto">
                  <RotateCcw className="h-4 w-4" />
                  Reabrir
                </SubmitButton>
              </ActionForm>
              ) : null
            ) : (
              <>
                {dono && e.status !== 'DELIVERED' ? (
                  <ConfirmDelete
                    action={setCustomerOrderStatus}
                    fields={{ id: e.id, status: 'CANCELLED' }}
                    title={`Cancelar a encomenda #${e.number}?`}
                    description="Fica na lista como Cancelada, para se ver depois quantas se perderam. Pode reabrir."
                    confirmLabel="Cancelar encomenda"
                    trigger={
                      <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                    }
                  />
                ) : null}

                {seguinte ? (
                  e.status === 'REQUESTED' && !e.productionOrderId ? (
                    <ActionForm action={produceCustomerOrders} showSuccess={false} className="space-y-0">
                      <input type="hidden" name="ids" value={e.id} />
                      <SubmitButton className="w-full sm:w-auto" disabled={!temLinhas} pendingLabel="A criar…">
                        <ChefHat className="h-4 w-4" />
                        Produzir esta encomenda
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <ActionForm action={setCustomerOrderStatus} showSuccess={false} className="space-y-0">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value={seguinte} />
                      <SubmitButton className="w-full sm:w-auto" disabled={!temLinhas}>
                        {ACAO_SEGUINTE[e.status]}
                      </SubmitButton>
                    </ActionForm>
                  )
                ) : null}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Linha({
  label,
  value,
  forte = false,
  className,
}: {
  label: string;
  value: string;
  forte?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', forte && 'font-medium', className)}>
      <span className={forte ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * A encomenda vista pela cozinha: o que fazer, para quando, e as notas. Sem
 * precos, lucro, pagamento nem o telefone do cliente — so o nome. Pode mudar o
 * estado e mandar para producao, como no caminho do dono.
 */
function EncomendaCozinha({ e }: { e: Encomenda }) {
  const agora = nowInLisbon();
  const aberta = e.status !== 'DELIVERED' && e.status !== 'CANCELLED';
  const dia = relativeDay(e.dueAt, agora);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/encomendas" className="text-sm text-muted-foreground hover:underline">
            Encomendas
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            #{e.number} · {e.customer?.name ?? 'Sem cliente'}
          </h1>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="first-letter:uppercase">{dataFmt.format(e.dueAt)}</span>
          {aberta && e.dueAt < agora ? (
            <Badge variant="destructive">atrasada</Badge>
          ) : aberta && dia ? (
            <Badge variant="warning">{dia}</Badge>
          ) : null}
        </p>
      </header>

      <Pipeline e={e} temLinhas={e.lines.length > 0} dono={false} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>O que fazer</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.recipe.name}</span>
                      {l.notes ? <span className="block text-xs text-muted-foreground">{l.notes}</span> : null}
                    </TableCell>
                    <TableNum className="text-base font-semibold">{num(l.qty)}</TableNum>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <CartaoInfo icon={CalendarClock} titulo="Entrega">
          <p className="font-medium first-letter:uppercase">{dataFmt.format(e.dueAt)}</p>
          <p className="text-muted-foreground">
            {e.fulfillment === 'DELIVERY' ? 'Nós entregamos' : 'Cliente levanta'}
          </p>
          {e.fulfillment === 'DELIVERY' && e.address ? <p className="whitespace-pre-line">{e.address}</p> : null}
          {e.notes ? (
            <p className="whitespace-pre-line rounded-md bg-muted/60 px-2 py-1.5 text-sm">{e.notes}</p>
          ) : null}
        </CartaoInfo>
      </div>
    </div>
  );
}