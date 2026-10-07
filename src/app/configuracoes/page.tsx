import Link from 'next/link';
import { Plus } from 'lucide-react';

import {
  ActionForm,
  ConfirmDelete,
  FormDialog,
  SubmitButton,
} from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { ChannelFields } from '@/components/forms/fields';
import { Alert, Badge, Separator } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import {
  deleteChannel,
  saveChannel,
  saveFollowUpSettings,
  saveSettings,
} from '@/lib/actions/settings';
import { CHAVES_MENSAGEM, MENSAGEM_POS_VENDA } from '@/lib/pricing/clientes';
import { num } from '@/lib/mappers';
import { formatMoney, SUPPORTED_CURRENCIES, currencyOf } from '@/lib/money';
import { priceDenominator } from '@/lib/pricing/price';
import { getAllChannels, getSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const CHANNEL_KIND_LABEL: Record<string, string> = {
  COUNTER: 'Balcao / consumo local',
  OWN_DELIVERY: 'Entrega propria',
  PLATFORM: 'Plataforma de delivery',
};

export default async function ConfiguracoesPage() {
  const [s, channels] = await Promise.all([getSettings(), getAllChannels()]);
  const currency = currencyOf(s);

  const pct = (v: unknown) => (num(v) * 100).toFixed(2).replace(/\.?0+$/, '');

  // Quanto sobra de cada euro liquido depois de custos fixos e taxas, antes
  // do custo do produto. E o "espaco" que o motor tem para trabalhar.
  const headroom = priceDenominator(
    {
      vatRate: num(s.vatRate),
      vatMode: s.vatMode,
      fixedCostRate: num(s.fixedCostRate),
      cardFeeRate: num(s.cardFeeRate),
      platformFeeRate: 0,
      deliveryCost: 0,
    },
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuracoes
            <AjudaLink secao="configuracoes" />
          </h1>
        <p className="text-sm text-muted-foreground">
          As variaveis globais que entram no preco de todos os produtos.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Negocio e moeda</CardTitle>
            <CardDescription>
              A moeda escolhida formata todos os valores da aplicacao.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveSettings}>
              <Field label="Nome do negocio" htmlFor="businessName">
                <Input
                  id="businessName"
                  name="businessName"
                  defaultValue={s.businessName ?? ''}
                  placeholder="Lanchonete do Bairro"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Moeda" htmlFor="currency">
                  <Select id="currency" name="currency" defaultValue={s.currency}>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Formato regional"
                  htmlFor="locale"
                  hint="Define a virgula decimal e a posicao do simbolo."
                >
                  <Select id="locale" name="locale" defaultValue={s.locale}>
                    <option value="pt-PT">Portugal (1 234,56 €)</option>
                    <option value="pt-BR">Brasil (R$ 1.234,56)</option>
                    <option value="en-US">Estados Unidos ($1,234.56)</option>
                    <option value="en-GB">Reino Unido (£1,234.56)</option>
                  </Select>
                </Field>
                <Field
                  label="Casas decimais"
                  htmlFor="displayDecimals"
                  hint="Nas quantidades e no custo por kg, L ou un. Os totais em dinheiro tem sempre 2. So muda o que se ve: as contas usam a precisao toda."
                >
                  <Select
                    id="displayDecimals"
                    name="displayDecimals"
                    defaultValue={String(s.displayDecimals)}
                  >
                    <option value="4">Automatico, ate 4 (0,395 kg · 1,6875 €/kg)</option>
                    <option value="2">2 casas (0,40 kg · 1,69 €/kg)</option>
                  </Select>
                </Field>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="IVA / imposto (%)"
                  htmlFor="vatRate"
                  hint="Restauracao em Portugal: 13% comida, 23% bebidas."
                >
                  <Input
                    id="vatRate"
                    name="vatRate"
                    inputMode="decimal"
                    defaultValue={pct(s.vatRate)}
                  />
                </Field>
                <Field
                  label="O preco de menu…"
                  htmlFor="vatMode"
                  hint="Numa lanchonete o preco exposto normalmente ja inclui IVA."
                >
                  <Select id="vatMode" name="vatMode" defaultValue={s.vatMode}>
                    <option value="INCLUDED">ja inclui o IVA</option>
                    <option value="ADDED">e acrescido de IVA</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Custos fixos (%)"
                  htmlFor="fixedCostRate"
                  hint="Sobre a receita liquida. Escrever aqui e um palpite; em Despesas fixas sai das contas."
                >
                  <Input
                    id="fixedCostRate"
                    name="fixedCostRate"
                    inputMode="decimal"
                    defaultValue={pct(s.fixedCostRate)}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Esta percentagem entra no preco de todos os produtos.{' '}
                    <Link href="/despesas" className="text-primary hover:underline">
                      Lance as suas contas
                    </Link>{' '}
                    e ela sai da divisao, em vez de ser um numero escolhido.
                  </p>
                </Field>
                <Field
                  label="Taxa media de cartao (%)"
                  htmlFor="cardFeeRate"
                  hint="Sobre o valor bruto pago pelo cliente."
                >
                  <Input
                    id="cardFeeRate"
                    name="cardFeeRate"
                    inputMode="decimal"
                    defaultValue={pct(s.cardFeeRate)}
                  />
                </Field>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="CMV alvo (%)"
                  htmlFor="targetCmv"
                  hint="Quanto do que voce fatura pode ser custo do produto. Quanto menor, mais eficiente."
                >
                  <Input
                    id="targetCmv"
                    name="targetCmv"
                    inputMode="decimal"
                    defaultValue={pct(s.targetCmv)}
                  />
                </Field>
                <Field
                  label="Lucro liquido alvo (%)"
                  htmlFor="targetMargin"
                  hint="Usado no modo de precificacao por margem."
                >
                  <Input
                    id="targetMargin"
                    name="targetMargin"
                    inputMode="decimal"
                    defaultValue={pct(s.targetMargin)}
                  />
                </Field>
              </div>

              <Field
                label="Arredondamento do preco sugerido"
                htmlFor="rounding"
                hint="Arredonda sempre para cima, para nao comer a margem calculada."
              >
                <Select id="rounding" name="rounding" defaultValue={s.rounding}>
                  <option value="NONE">Sem arredondamento</option>
                  <option value="NEAREST_05">Multiplo de 0,05</option>
                  <option value="NEAREST_10">Multiplo de 0,10</option>
                  <option value="ENDING_90">Terminar em ,90</option>
                  <option value="ENDING_95">Terminar em ,95</option>
                </Select>
              </Field>

              {headroom <= 0 ? (
                <Alert tone="destructive">
                  Com estas taxas nao sobra nada da receita para pagar o produto —
                  nenhum preco fecha. Reduza os custos fixos ou o IVA.
                </Alert>
              ) : (
                <Alert tone="info">
                  De cada {formatMoney(1, currency)} de preco de menu sobram{' '}
                  <strong>{formatMoney(headroom, currency)}</strong> para cobrir o
                  custo do produto e gerar lucro, antes de comissoes de plataforma.
                </Alert>
              )}

              <SubmitButton>Guardar configuracoes</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Canais de venda</CardTitle>
                <CardDescription>
                  Cada canal tem as suas taxas. O canal de balcao serve de
                  referencia de lucro para os outros.
                </CardDescription>
              </div>
              <FormDialog
                action={saveChannel}
                title="Novo canal de venda"
                submitLabel="Adicionar canal"
                trigger={
                  <Button size="sm" className="shrink-0">
                    <Plus className="h-4 w-4" />
                    Novo
                  </Button>
                }
              >
                <ChannelFields idPrefix="novo" />
              </FormDialog>
            </CardHeader>
            <CardContent className="space-y-3">
              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum canal configurado. Crie pelo menos o balcao.
                </p>
              ) : (
                channels.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        <Badge variant="secondary">
                          {CHANNEL_KIND_LABEL[c.kind] ?? c.kind}
                        </Badge>
                        {c.active ? null : <Badge variant="outline">inativo</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Comissao {(num(c.commissionRate) * 100).toFixed(1)}%
                        {num(c.deliveryCost) > 0
                          ? ` · frete ${formatMoney(num(c.deliveryCost), currency)}`
                          : ''}
                        {c.cardFeeRate !== null
                          ? ` · cartao ${(num(c.cardFeeRate) * 100).toFixed(1)}%`
                          : ' · cartao global'}
                        {c.usesDeliveryPackaging ? ' · embalagem de transporte' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <FormDialog
                        action={saveChannel}
                        title={`Editar ${c.name}`}
                        description="As taxas deste canal entram no preco de todos os produtos nele."
                        submitLabel="Guardar alteracoes"
                      >
                        <ChannelFields channel={c} idPrefix={`edit-${c.id}`} />
                      </FormDialog>

                      <ConfirmDelete
                        action={deleteChannel}
                        fields={{ id: c.id }}
                        title={`Remover o canal "${c.name}"?`}
                        description="Os precos calculados para este canal deixam de aparecer. Para o esconder sem perder as taxas, desmarque antes a opcao Canal ativo na edicao."
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pós-venda</CardTitle>
              <CardDescription>
                Quando perguntar ao cliente se gostou, e a mensagem que vai no WhatsApp.
                Só se escreve a quem aceitou ser contactado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveFollowUpSettings}>
                <Field
                  label="Dias depois da entrega"
                  htmlFor="followUpDays"
                  hint="Conta a partir de quando a encomenda é marcada como entregue."
                >
                  <Input
                    id="followUpDays"
                    name="followUpDays"
                    inputMode="numeric"
                    defaultValue={String(s.followUpDays)}
                    className="w-24"
                  />
                </Field>
                <Field
                  label="Mensagem do WhatsApp"
                  htmlFor="followUpMessage"
                  hint={
                    <>
                      Pode usar {CHAVES_MENSAGEM.join(', ')} — trocam-se pelo primeiro nome do
                      cliente, o nome da casa, os produtos e o dia da entrega. Apague tudo
                      para voltar à mensagem de origem.
                    </>
                  }
                >
                  <Textarea
                    id="followUpMessage"
                    name="followUpMessage"
                    rows={6}
                    defaultValue={s.followUpMessage ?? MENSAGEM_POS_VENDA}
                  />
                </Field>
                <SubmitButton>Guardar pós-venda</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
