import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Boxes, ClipboardCheck, Trash2 } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { FormDialog } from '@/components/action-form';
import { GroupedList, type ListColumn, type ListRow } from '@/components/data-list';
import { StatTile } from '@/components/dre-breakdown';
import { Alert, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { QtyInput } from '@/components/ui/qty-input';
import { Input, Textarea } from '@/components/ui/input';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { countInventory, recordAdjustment, setCostBasis } from '@/lib/actions/stock';
import { num } from '@/lib/mappers';
import { formatMoney } from '@/lib/money';
import { lowStock, MOVEMENT_LABEL, type MovementKind } from '@/lib/pricing/stock';
import { getMovements, getSettings, getStockLines } from '@/lib/queries';
import {
  displayUnitOf,
  DISPLAY_UNIT_LABEL,
  formatBaseQty,
  formatCostPerUnit,
} from '@/lib/units';

export const dynamic = 'force-dynamic';

const COLUMNS: ListColumn[] = [
  { header: 'Insumo' },
  { header: 'Em estoque', align: 'right' },
  { header: 'Custo medio', align: 'right', hideBelow: 'lg' },
  { header: 'Valor', align: 'right' },
  { header: 'Ultimo movimento', hideBelow: 'xl' },
];

export default async function EstoquePage() {
  const [linhas, movimentos, s] = await Promise.all([
    getStockLines(),
    getMovements(40),
    getSettings(),
  ]);
  const currency = { currency: s.currency, locale: s.locale };

  const dataFmt = new Intl.DateTimeFormat(currency.locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const valorTotal = linhas.reduce(
    (acc, l) => acc + num(l.row.stockBase) * num(l.row.avgCostBase),
    0,
  );
  const negativos = linhas.filter((l) => num(l.row.stockBase) < 0);
  // Saldo sem custo conhecido: tipicamente estoque de arranque, digitado a
  // mao. As saidas dele entrariam no CMV real a zero.
  const semCusto = linhas.filter(
    (l) => num(l.row.stockBase) > 0 && num(l.row.avgCostBase) <= 0,
  );
  const semMovimento = linhas.filter((l) => l.last === null).length;

  // Quem esta a acabar. `lowStock` ja deixa de fora quem nao tem minimo
  // definido e ordena do mais grave para o menos.
  const aAcabar = lowStock(
    linhas.map((l) => ({
      ingredientId: l.row.id,
      name: l.row.name,
      baseUnit: l.row.baseUnit,
      qtyBase: num(l.row.stockBase),
      minBase: l.row.minStockBase === null ? null : num(l.row.minStockBase),
    })),
  );
  const nivelPorId = new Map(aAcabar.map((l) => [l.ingredientId, l.level]));
  // Os negativos ja tem aviso proprio; aqui conta-se o que falta comprar.
  const paraRepor = aAcabar.filter((l) => l.level !== 'NEGATIVO');
  const semMinimo = linhas.filter((l) => l.row.minStockBase === null).length;

  const build = ({ row, last }: (typeof linhas)[number]): ListRow => {
    const qty = num(row.stockBase);
    const medio = num(row.avgCostBase);
    const valor = qty * medio;
    const unidade = DISPLAY_UNIT_LABEL[row.baseUnit];

    const nivel = nivelPorId.get(row.id);

    const saldo = (
      <span key="s" className="inline-flex items-center gap-1.5">
        <span className={qty < 0 ? 'font-medium text-destructive' : 'font-medium'}>
          {formatBaseQty(qty, row.baseUnit, currency.locale)}
        </span>
        {nivel === 'ACABOU' ? (
          <Badge variant="destructive">acabou</Badge>
        ) : nivel === 'BAIXO' ? (
          <Badge variant="warning">a acabar</Badge>
        ) : null}
      </span>
    );

    const ultimo = last
      ? `${MOVEMENT_LABEL[last.kind as MovementKind]} · ${dataFmt.format(last.occurredAt)}`
      : 'sem movimentos';

    return {
      id: row.id,
      search: `${row.name} ${row.supplier?.name ?? ''}`,
      cells: [
        <div key="n">
          <div className="font-medium">{row.name}</div>
          {row.supplier ? (
            <div className="text-xs text-muted-foreground">{row.supplier.name}</div>
          ) : null}
        </div>,
        saldo,
        <span key="m" className="text-muted-foreground">
          {medio > 0 ? formatCostPerUnit(medio, row.baseUnit, currency) : '—'}
        </span>,
        <span key="v" className="font-medium">
          {formatMoney(valor, currency)}
        </span>,
        <span key="u" className="text-xs text-muted-foreground">
          {ultimo}
        </span>,
      ],
      title: row.name,
      lead: saldo,
      meta: (
        <>
          {formatMoney(valor, currency)}
          {medio > 0 ? ` · ${formatCostPerUnit(medio, row.baseUnit, currency)}` : ''} ·{' '}
          {ultimo}
        </>
      ),
      actions: (
        <>
          <FormDialog
            action={countInventory}
            title={`Contar ${row.name}`}
            description="Escreva o que contou no armazem. A aplicacao regista a diferenca — e a diferenca que interessa."
            submitLabel="Registar contagem"
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ClipboardCheck className="h-4 w-4" />
                <span className="sr-only">Contar</span>
              </Button>
            }
          >
            <input type="hidden" name="ingredientId" value={row.id} />
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              A aplicacao diz{' '}
              <strong>{formatBaseQty(qty, row.baseUnit, currency.locale)}</strong>.
            </p>
            <Field label="Contei" htmlFor={`c-${row.id}`}>
              <QtyInput
                id={`c-${row.id}`}
                name="counted"
                unitLabel={unidade}
                unitName="unit"
                unitValue={displayUnitOf(row.baseUnit)}
                required
              />
            </Field>
            <Field label="Nota" htmlFor={`cn-${row.id}`}>
              <Input id={`cn-${row.id}`} name="note" placeholder="Inventario de fim de mes" />
            </Field>
          </FormDialog>

          <FormDialog
            action={recordAdjustment}
            title={`Movimento manual — ${row.name}`}
            description="Quebra, estrago, validade, ou uma correcao pontual."
            submitLabel="Registar"
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Quebra ou ajuste</span>
              </Button>
            }
          >
            <input type="hidden" name="ingredientId" value={row.id} />
            <Field label="Tipo" htmlFor={`k-${row.id}`}>
              <Select id={`k-${row.id}`} name="kind" defaultValue="WASTE">
                <option value="WASTE">Quebra — estragou, caiu, passou a validade</option>
                <option value="ADJUSTMENT">Ajuste manual</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantidade" htmlFor={`q-${row.id}`}>
                <QtyInput
                  id={`q-${row.id}`}
                  name="qty"
                  unitLabel={unidade}
                  unitName="unit"
                  unitValue={displayUnitOf(row.baseUnit)}
                  required
                />
              </Field>
              <Field
                label="Sentido"
                htmlFor={`d-${row.id}`}
                hint="Ignorado na quebra, que so tira."
              >
                <Select id={`d-${row.id}`} name="direction" defaultValue="OUT">
                  <option value="OUT">Sai do estoque</option>
                  <option value="IN">Entra no estoque</option>
                </Select>
              </Field>
            </div>
            <Field label="Nota" htmlFor={`n-${row.id}`}>
              <Textarea id={`n-${row.id}`} name="note" placeholder="Caiu no chao" />
            </Field>
          </FormDialog>
        </>
      ),
    };
  };

  const food = linhas.filter((l) => l.row.category === 'FOOD').map(build);
  const packaging = linhas.filter((l) => l.row.category === 'PACKAGING').map(build);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Estoque
            <AjudaLink secao="estoque" />
          </h1>
        <p className="text-sm text-muted-foreground">
          O saldo e a soma dos movimentos, nao um numero digitado. As entradas vem
          de{' '}
          <Link href="/producao" className="text-primary hover:underline">
            receber uma compra
          </Link>{' '}
          e as saidas de registar uma producao.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Dinheiro parado no estoque"
          value={formatMoney(valorTotal, currency)}
          hint="O que ja pagou e ainda nao vendeu"
        />
        <StatTile
          label="Saldos negativos"
          value={String(negativos.length)}
          tone={negativos.length > 0 ? 'critical' : 'good'}
          hint="Gastou mais do que tinha dado entrada"
        />
        <StatTile
          label="A acabar"
          value={String(paraRepor.length)}
          tone={paraRepor.length > 0 ? 'warning' : 'good'}
          hint={
            paraRepor.length > 0
              ? 'No minimo que voce definiu, ou abaixo'
              : semMinimo === linhas.length
                ? 'Nenhum insumo tem minimo definido'
                : 'Nada abaixo do minimo'
          }
        />
        <StatTile
          label="Sem preco registado"
          value={String(semCusto.length)}
          tone={semCusto.length > 0 ? 'warning' : 'good'}
          hint={
            semCusto.length > 0
              ? 'O gasto com estes nao aparece nas contas'
              : `${semMovimento} insumo(s) nunca se mexeram`
          }
        />
      </div>

      {paraRepor.length > 0 ? (
        <Alert tone="warning">
          <p className="font-medium">
            {paraRepor.length} insumo(s) no minimo ou abaixo.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {paraRepor.map((l) => (
              <li key={l.ingredientId}>
                <strong>{l.name}</strong>: tem{' '}
                {formatBaseQty(l.qtyBase, l.baseUnit, currency.locale)}
                {l.minBase !== null ? (
                  <>
                    {' '}
                    de {formatBaseQty(l.minBase, l.baseUnit, currency.locale)} —
                    faltam{' '}
                    <strong>
                      {formatBaseQty(l.missingBase, l.baseUnit, currency.locale)}
                    </strong>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            O minimo define-se em cada insumo, no campo &quot;Avisar abaixo de&quot;.
            Sem minimo nao ha aviso.
          </p>
        </Alert>
      ) : null}

      {semCusto.length > 0 ? (
        <Alert tone="warning">
          <p className="font-medium">
            {semCusto.length} insumo(s) estao no estoque sem preco registado.
          </p>
          <p className="mt-1">
            Acontece com o que voce digitou a mao e nunca comprou pela
            aplicacao: ela sabe a quantidade, mas nao o que custou. Enquanto
            for assim, o gasto com estes insumos nao entra nas contas e o seu
            custo parece menor do que e. Marque-os com o preco de compra atual:
          </p>
          <ul className="mt-2 space-y-1.5">
            {semCusto.map((l) => (
              <li key={l.row.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.row.name}</span>
                <span className="text-xs">
                  {formatBaseQty(num(l.row.stockBase), l.row.baseUnit, currency.locale)}
                </span>
                <ActionForm action={setCostBasis} showSuccess={false}>
                  <input type="hidden" name="ingredientId" value={l.row.id} />
                  <SubmitButton size="sm" variant="outline">
                    Usar o preco atual
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {negativos.length > 0 ? (
        <Alert tone="warning">
          {negativos.length} insumo(s) com saldo negativo:{' '}
          {negativos.map((l) => l.row.name).join(', ')}. Isso acontece quando se
          regista a producao antes da compra. Receba a compra da ordem ou faca uma
          contagem para acertar.
        </Alert>
      ) : null}

      <GroupedList
        storageKey="estoque"
        searchPlaceholder="Procurar insumo…"
        groups={[
          {
            id: 'food',
            title: 'Insumos alimenticios',
            columns: COLUMNS,
            rows: food,
            empty: 'Nenhum insumo cadastrado.',
          },
          {
            id: 'packaging',
            title: 'Embalagens e descartaveis',
            columns: COLUMNS,
            rows: packaging,
            empty: 'Nenhuma embalagem cadastrada.',
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            Ultimos movimentos
          </CardTitle>
          <CardDescription>
            O livro. E aqui que se responde a &quot;porque e que diz isto?&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {movimentos.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Ainda nao ha movimentos. Receba a compra de uma ordem de producao para
              comecar.
            </p>
          ) : (
            <ul className="divide-y">
              {movimentos.map((m) => {
                const qty = num(m.qtyBase);
                const entra = qty > 0;
                return (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 px-4 py-2.5 sm:px-6"
                  >
                    {entra ? (
                      <ArrowUpRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="entrada"
                      />
                    ) : (
                      <ArrowDownRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-label="saida"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{m.ingredient.name}</span>
                        <span className="tabular-nums">
                          {entra ? '+' : ''}
                          {formatBaseQty(qty, m.ingredient.baseUnit, currency.locale)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <Badge variant="secondary">
                          {MOVEMENT_LABEL[m.kind as MovementKind]}
                        </Badge>{' '}
                        {dataFmt.format(m.occurredAt)} ·{' '}
                        {formatMoney(Math.abs(num(m.value)), currency)}
                        {m.order ? (
                          <>
                            {' · '}
                            <Link
                              href={`/producao/${m.order.id}`}
                              className="text-primary hover:underline"
                            >
                              {m.order.name}
                            </Link>
                          </>
                        ) : null}
                        {m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
