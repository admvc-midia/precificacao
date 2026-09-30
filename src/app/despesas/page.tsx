/**
 * Despesas fixas, e a percentagem que sai delas.
 *
 * O `fixedCostRate` entrou na configuracao como 0,22 — um numero redondo
 * escolhido sem dados. Como ele e um termo da equacao do preco, um palpite
 * ali e um palpite em todos os precos da casa, na mesma proporcao. Esta
 * pagina troca o palpite por uma conta.
 *
 * A percentagem nao se aplica sozinha: mostra-se, compara-se com a que esta
 * em vigor, e ha um botao. E a mesma regra das cotacoes de preco — um numero
 * que precifica a casa toda nao muda por baixo dos pes de ninguem.
 */

import Link from 'next/link';
import { Plus, Power, Wallet } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { ActionForm, ConfirmDelete, FormDialog, SubmitButton } from '@/components/action-form';
import { DataList, type ListColumn, type ListRow } from '@/components/data-list';
import { StatTile } from '@/components/dre-breakdown';
import { Alert, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import {
  applyFixedCostRate,
  deleteExpense,
  saveExpectedRevenue,
  saveExpense,
  toggleExpense,
} from '@/lib/actions/expenses';
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { formatMoney, formatPercent, currencyOf } from '@/lib/money';
import {
  CATEGORY_LABEL,
  fixedCostRateFrom,
  monthlyAmount,
  netFromGross,
  PERIOD_LABEL,
  totalMonthly,
  type ExpensePeriod,
} from '@/lib/pricing/expenses';
import { getSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const CATEGORIA_LABEL = CATEGORY_LABEL;

/**
 * O que costuma ficar esquecido.
 *
 * Nao e enfeite: uma lista de despesas incompleta produz uma percentagem
 * baixa de mais, e essa percentagem passa para o preco de todos os produtos.
 * Esquecer o contabilista e vender abaixo do custo o ano inteiro.
 */
const COSTUMA_ESQUECER = [
  'Contabilista',
  'Seguro do espaco',
  'Licenca da camara',
  'Manutencao de equipamento',
  'Internet e telemovel',
  'Software e assinaturas',
  'Terminal de pagamento (aluguer)',
  'Uniformes e limpeza',
];

const COLUMNS: ListColumn[] = [
  { header: 'Despesa' },
  { header: 'Valor', align: 'right' },
  { header: 'Por mes', align: 'right' },
  { header: 'Peso', align: 'right', hideBelow: 'lg' },
];

export default async function DespesasPage() {
  const [despesas, s] = await Promise.all([
    prisma.expense.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    getSettings(),
  ]);
  const currency = currencyOf(s);

  const lista = despesas.map((d) => ({
    id: d.id,
    name: d.name,
    amount: num(d.amount),
    period: d.period as ExpensePeriod,
    active: d.active,
  }));

  const totalMes = totalMonthly(lista);

  // ------------------------------------------------ a receita do mes
  //
  // A faturacao escrita a mao ganha ao que as vendas dizem: quem a escreveu
  // fe-lo justamente para responder "e se", ou porque ainda nao ha vendas.
  const escrita = s.expectedMonthlyRevenue === null ? null : num(s.expectedMonthlyRevenue);

  const vendas = await prisma.salesRecord.groupBy({
    by: ['period'],
    _sum: { revenue: true },
    orderBy: { period: 'desc' },
    take: 3,
  });
  const comReceita = vendas.filter((v) => v._sum.revenue !== null);
  const mediaVendas =
    comReceita.length > 0
      ? comReceita.reduce((a, v) => a + num(v._sum.revenue), 0) / comReceita.length
      : null;

  const semReceitaPreenchida = await prisma.salesRecord.count({
    where: { revenue: null },
  });

  const brutoMes = escrita ?? mediaVendas;
  const liquidoMes = brutoMes === null ? null : netFromGross(brutoMes, num(s.vatRate));
  const calculo = liquidoMes === null ? null : fixedCostRateFrom(totalMes, liquidoMes);

  const atual = num(s.fixedCostRate);
  const diferente = calculo !== null && Math.abs(calculo.rate - atual) > 0.0005;

  // ------------------------------------------------ linhas
  const build = (d: (typeof despesas)[number]): ListRow => {
    const valor = num(d.amount);
    const mes = monthlyAmount(valor, d.period as ExpensePeriod);
    const peso = totalMes > 0 && d.active ? mes / totalMes : 0;

    return {
      id: d.id,
      search: `${d.name} ${CATEGORIA_LABEL[d.category] ?? ''}`,
      cells: [
        <div key="n">
          <div className={d.active ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
            {d.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {CATEGORIA_LABEL[d.category] ?? d.category}
            {d.notes ? ` · ${d.notes}` : ''}
          </div>
        </div>,
        <span key="v" className="tabular-nums text-muted-foreground">
          {formatMoney(valor, currency)}
          <span className="block text-xs">{PERIOD_LABEL[d.period as ExpensePeriod]}</span>
        </span>,
        <span key="m" className={d.active ? 'font-medium tabular-nums' : 'tabular-nums text-muted-foreground'}>
          {d.active ? formatMoney(mes, currency) : '—'}
        </span>,
        <span key="p" className="tabular-nums text-muted-foreground">
          {d.active && peso > 0 ? formatPercent(peso, currency.locale, 0) : '—'}
        </span>,
      ],
      title: d.name,
      lead: (
        <span className="font-medium tabular-nums">
          {d.active ? formatMoney(mes, currency) : '—'}
        </span>
      ),
      meta: (
        <>
          {CATEGORIA_LABEL[d.category] ?? d.category} · {formatMoney(valor, currency)}{' '}
          {PERIOD_LABEL[d.period as ExpensePeriod]}
          {d.active ? null : <Badge variant="secondary"> nao conta</Badge>}
        </>
      ),
      actions: (
        <>
          <ActionForm action={toggleExpense} showSuccess={false}>
            <input type="hidden" name="id" value={d.id} />
            <SubmitButton
              size="sm"
              variant="ghost"
              pendingLabel="…"
              className="text-muted-foreground"
            >
              <Power className="h-4 w-4" />
              <span className="sr-only">{d.active ? 'Deixar de contar' : 'Voltar a contar'}</span>
            </SubmitButton>
          </ActionForm>

          <FormDialog
            action={saveExpense}
            title={`Editar ${d.name}`}
            description="O valor fica no periodo em que a conta chega. A aplicacao mensaliza."
            submitLabel="Guardar"
          >
            <input type="hidden" name="id" value={d.id} />
            <CamposDespesa despesa={d} />
          </FormDialog>

          <ConfirmDelete
            action={deleteExpense}
            fields={{ id: d.id }}
            title={`Remover "${d.name}"?`}
            description="Se e so para deixar de contar temporariamente, use o botao de ligar/desligar — a linha fica no historico."
          />
        </>
      ),
    };
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Despesas fixas
            <AjudaLink secao="despesas" />
          </h1>
        <p className="text-sm text-muted-foreground">
          O que se paga haja ou nao vendas. A soma destas, dividida pelo que
          fatura, e a percentagem de custos fixos que entra no preco de todos os
          produtos.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Despesas por mes"
          value={formatMoney(totalMes, currency)}
          hint={`${lista.filter((l) => l.active).length} conta(s) a contar`}
        />
        <StatTile
          label="Custos fixos em vigor"
          value={formatPercent(atual, currency.locale)}
          hint="O que o motor de precos usa agora"
        />
        <StatTile
          label="Calculado das despesas"
          value={calculo === null ? '—' : formatPercent(calculo.rate, currency.locale)}
          tone={calculo?.impossible ? 'critical' : diferente ? 'warning' : 'good'}
          hint={
            calculo === null
              ? 'Falta dizer quanto fatura por mes'
              : diferente
                ? 'Diferente do que esta em vigor'
                : 'Igual ao que esta em vigor'
          }
        />
      </div>

      {/* ------------------------------------------------ o calculo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            De quanto fatura sai a percentagem
          </CardTitle>
          <CardDescription>
            A conta e <strong>despesas do mes ÷ receita liquida do mes</strong>. Liquida
            quer dizer sem IVA: e sobre essa que o motor aplica os custos fixos, e
            dividir pela faturacao com IVA daria uma percentagem menor do que a real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={saveExpectedRevenue}>
            <Field
              label="Faturacao mensal esperada, com IVA"
              htmlFor="rev"
              hint={
                mediaVendas !== null
                  ? `Deixe vazio para usar a media das vendas registadas: ${formatMoney(mediaVendas, currency)}.`
                  : 'Ainda nao ha vendas registadas de onde tirar este valor.'
              }
            >
              <Input
                id="rev"
                name="expectedMonthlyRevenue"
                inputMode="decimal"
                defaultValue={escrita === null ? '' : String(escrita)}
                placeholder="10000"
              />
            </Field>
            <SubmitButton variant="outline" size="sm">
              Guardar faturacao
            </SubmitButton>
          </ActionForm>

          {semReceitaPreenchida > 0 ? (
            <Alert tone="info">
              Ha {semReceitaPreenchida} registo(s) de venda sem a receita preenchida.
              Esses nao entram na media, por isso ela fica mais baixa do que a
              realidade. Preencha-os em{' '}
              <Link href="/vendas" className="underline">
                Vendas
              </Link>
              , ou escreva a faturacao aqui a mao.
            </Alert>
          ) : null}

          {calculo === null ? (
            <Alert tone="warning">
              Sem saber quanto fatura por mes nao ha como transformar{' '}
              {formatMoney(totalMes, currency)} de despesas numa percentagem. Escreva a
              faturacao esperada acima.
            </Alert>
          ) : (
            <div className="space-y-3">
              <dl className="grid gap-3 sm:grid-cols-3">
                <Linha
                  termo="Despesas por mes"
                  valor={formatMoney(calculo.totalMonthly, currency)}
                />
                <Linha
                  termo="Receita liquida por mes"
                  valor={formatMoney(calculo.netMonthlyRevenue, currency)}
                  nota={brutoMes !== null ? `${formatMoney(brutoMes, currency)} com IVA` : undefined}
                />
                <Linha
                  termo="Custos fixos"
                  valor={formatPercent(calculo.rate, currency.locale)}
                  destaque
                />
              </dl>

              {calculo.impossible ? (
                <Alert tone="destructive">
                  <p className="font-medium">
                    As despesas fixas sozinhas comem a receita toda.
                  </p>
                  <p className="mt-1">
                    Com {formatMoney(calculo.totalMonthly, currency)} de contas e{' '}
                    {formatMoney(calculo.netMonthlyRevenue, currency)} de receita liquida,
                    nao sobra nada para os insumos, quanto mais para o lucro. Nao ha preco
                    que resolva isto — ou a faturacao sobe, ou as contas descem. A
                    aplicacao nao aceita esta percentagem porque ela mandaria os precos
                    para o infinito.
                  </p>
                </Alert>
              ) : diferente ? (
                <ActionForm action={applyFixedCostRate}>
                  <input type="hidden" name="rate" value={String(calculo.rate)} />
                  <Alert tone="warning">
                    O motor esta a usar {formatPercent(atual, currency.locale)} e as suas
                    contas dizem {formatPercent(calculo.rate, currency.locale)}. Aplicar
                    recalcula o preco sugerido de todos os produtos.
                  </Alert>
                  <SubmitButton>
                    Usar {formatPercent(calculo.rate, currency.locale)} nos precos
                  </SubmitButton>
                </ActionForm>
              ) : (
                <Alert tone="info">
                  A percentagem em vigor ja e a que as suas contas dizem. Nada a fazer.
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ a lista */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">As contas</h2>
        <FormDialog
          action={saveExpense}
          title="Nova despesa"
          description="O valor fica no periodo em que a conta chega — 600 por ano, e nao 50 por mes. A aplicacao mensaliza."
          submitLabel="Acrescentar"
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Nova despesa
            </Button>
          }
        >
          <CamposDespesa />
        </FormDialog>
      </div>

      {despesas.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
            <p>
              Ainda nao ha nenhuma conta lancada, e enquanto assim for os{' '}
              {formatPercent(atual, currency.locale)} de custos fixos sao um palpite que
              entra no preco de todos os produtos.
            </p>
            <p className="font-medium text-foreground">O que costuma ficar esquecido:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {COSTUMA_ESQUECER.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p>
              Uma lista incompleta da uma percentagem baixa de mais, e essa percentagem
              passa para o preco de tudo. Esquecer o contabilista e vender abaixo do
              custo o ano inteiro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DataList
          columns={COLUMNS}
          rows={despesas.map(build)}
          searchPlaceholder="Procurar despesa…"
          empty="Nenhuma despesa."
        />
      )}
    </div>
  );
}

function Linha({
  termo,
  valor,
  nota,
  destaque,
}: {
  termo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{termo}</dt>
      <dd
        className={
          destaque
            ? 'mt-1 text-2xl font-semibold tabular-nums'
            : 'mt-1 text-lg font-medium tabular-nums'
        }
      >
        {valor}
      </dd>
      {nota ? <dd className="text-xs text-muted-foreground">{nota}</dd> : null}
    </div>
  );
}

function CamposDespesa({
  despesa,
}: {
  despesa?: {
    name: string;
    amount: unknown;
    period: string;
    category: string;
    active: boolean;
    notes: string | null;
  };
}) {
  const id = (n: string) => `desp-${despesa?.name ?? 'nova'}-${n}`;

  return (
    <>
      <Field label="Nome" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          defaultValue={despesa?.name ?? ''}
          placeholder="Renda do espaco"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor" htmlFor={id('amount')}>
          <Input
            id={id('amount')}
            name="amount"
            inputMode="decimal"
            defaultValue={despesa ? String(num(despesa.amount)) : ''}
            placeholder="900"
            required
          />
        </Field>
        <Field
          label="Com que frequencia"
          htmlFor={id('period')}
          hint="Como a conta chega."
        >
          <Select id={id('period')} name="period" defaultValue={despesa?.period ?? 'MONTHLY'}>
            <option value="WEEKLY">Por semana</option>
            <option value="MONTHLY">Por mes</option>
            <option value="QUARTERLY">Por trimestre</option>
            <option value="YEARLY">Por ano</option>
          </Select>
        </Field>
      </div>

      <Field label="Familia" htmlFor={id('category')}>
        <Select
          id={id('category')}
          name="category"
          defaultValue={despesa?.category ?? 'OTHER'}
        >
          {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Nota" htmlFor={id('notes')}>
        <Input
          id={id('notes')}
          name="notes"
          defaultValue={despesa?.notes ?? ''}
          placeholder="opcional"
        />
      </Field>

      {/* O marcador diz que este formulario foi submetido; sem ele, uma caixa
          desmarcada e uma caixa ausente chegam iguais ao servidor. */}
      <input type="hidden" name="activeSubmitted" value="1" />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={despesa?.active ?? true}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          Contar esta despesa
          <span className="block text-xs text-muted-foreground">
            Desligar mantem a linha na lista sem a somar — serve para simular sem
            perder o registo.
          </span>
        </span>
      </label>
    </>
  );
}
