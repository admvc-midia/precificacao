'use client';

/**
 * Formulario de nova encomenda, pensado para o telemovel: lanca-se enquanto se
 * fala com o cliente.
 *
 * Submete com `onSubmit` + `startTransition`, e nao com `<form action>`: o
 * React limpa o formulario depois de uma action passada assim, e uma recusa
 * do servidor ("falta a morada") apagava as linhas todas que ja estavam
 * escritas.
 */

import { useActionState, useMemo, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2, XCircle } from 'lucide-react';

import type { ActionState } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { createCustomerOrder } from '@/lib/actions/encomendas';
import { formatMoney, parseDecimal, parseQty, type CurrencyConfig } from '@/lib/money';
import { SOURCE_LABEL, type CustomerSource } from '@/lib/pricing/clientes';
import { cn } from '@/lib/utils';

export interface ProdutoOpcao {
  id: string;
  name: string;
  /** Preco de tabela; nulo quando a ficha nao tem preco calculavel. */
  listPrice: number | null;
}

export interface ClienteOpcao {
  id: string;
  name: string;
  phone: string | null;
  /** Ja aceitou ser contactado depois. */
  consent: boolean;
}

interface Linha {
  key: number;
  recipeId: string;
  qty: string;
  price: string;
}

const INICIAL: ActionState = { ok: true };

/** O texto de uma opcao da lista de clientes: nome, e o telefone se houver. */
function rotulo(c: ClienteOpcao): string {
  return c.phone ? `${c.name} · ${c.phone}` : c.name;
}

export function NovaEncomenda({
  produtos,
  clientes,
  canais,
  canalPadrao,
  currency,
  clienteInicial,
}: {
  produtos: ProdutoOpcao[];
  clientes: ClienteOpcao[];
  canais: Array<{ id: string; name: string }>;
  canalPadrao: string;
  currency: CurrencyConfig;
  /** Vindo da ficha do cliente: ja escolhido. */
  clienteInicial?: ClienteOpcao;
}) {
  const [estado, acao] = useActionState(createCustomerOrder, INICIAL);
  const [aEnviar, startTransition] = useTransition();

  const [proxima, setProxima] = useState(1);
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 0, recipeId: '', qty: '1', price: '' }]);

  const [nomeCliente, setNomeCliente] = useState(clienteInicial?.name ?? '');
  const [clienteId, setClienteId] = useState(clienteInicial?.id ?? '');
  const [telefone, setTelefone] = useState(clienteInicial?.phone ?? '');
  const [consentimento, setConsentimento] = useState(false);
  const [origem, setOrigem] = useState('');

  const [entrega, setEntrega] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const porRotulo = useMemo(() => new Map(clientes.map((c) => [rotulo(c), c])), [clientes]);
  const escolhido = clienteId ? clientes.find((c) => c.id === clienteId) : undefined;

  function escreverCliente(valor: string) {
    const c = porRotulo.get(valor);
    if (c) {
      // Escolhido da lista: fica so o nome no campo, e o telefone ao lado.
      setClienteId(c.id);
      setNomeCliente(c.name);
      setTelefone(c.phone ?? '');
    } else {
      setClienteId('');
      setNomeCliente(valor);
    }
  }

  function mudarLinha(key: number, campo: keyof Omit<Linha, 'key'>, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  // Totais ao vivo, com o preco escrito ou o de tabela.
  const contas = linhas.map((l) => {
    const p = porId.get(l.recipeId);
    const qty = parseQty(l.qty);
    const unit = l.price.trim() ? parseDecimal(l.price) : (p?.listPrice ?? 0);
    return { total: qty * unit, tabela: p?.listPrice != null ? qty * p.listPrice : null };
  });
  const total = contas.reduce((a, c) => a + c.total, 0);
  const tabela = contas.reduce((a, c) => a + (c.tabela ?? c.total), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
            <CardDescription>
              Escreva o nome: se já encomendou, aparece na lista. Com o mesmo telefone, a app
              reconhece-o.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input type="hidden" name="customerId" value={clienteId} />
            <Field label="Nome" htmlFor="enc-cliente">
              <Input
                id="enc-cliente"
                name="customerName"
                list="enc-clientes"
                autoComplete="off"
                value={nomeCliente}
                onChange={(e) => escreverCliente(e.target.value)}
                placeholder="Ana Silva"
              />
              <datalist id="enc-clientes">
                {clientes.map((c) => (
                  <option key={c.id} value={rotulo(c)} />
                ))}
              </datalist>
            </Field>
            <Field label="Telefone" htmlFor="enc-telefone">
              <Input
                id="enc-telefone"
                name="customerPhone"
                type="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="912 345 678"
              />
            </Field>

            {/* De onde veio so se pergunta a um cliente novo. */}
            {!clienteId && nomeCliente.trim() ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Como nos conheceu" htmlFor="enc-origem">
                  <Select
                    id="enc-origem"
                    name="customerSource"
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                  >
                    <option value="">Não sei</option>
                    {(Object.keys(SOURCE_LABEL) as CustomerSource[]).map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {origem === 'REFERRAL' ? (
                  <Field label="Quem indicou" htmlFor="enc-indicou">
                    <Select id="enc-indicou" name="referredById" defaultValue="">
                      <option value="">Não está na lista</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            ) : null}

            {escolhido?.consent ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                Já aceitou ser contactado depois.
              </p>
            ) : (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="contactConsent"
                  checked={consentimento}
                  onChange={(e) => setConsentimento(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  Aceita ser contactado depois
                  <span className="block text-xs text-muted-foreground">
                    Para perguntar se gostou e avisar de novidades. Pergunte ao cliente — sem
                    esta autorização, o nome e o telefone servem só para esta encomenda (RGPD).
                  </span>
                </span>
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Dia e hora" htmlFor="enc-dia">
              <Input id="enc-dia" name="dueAt" type="datetime-local" required />
            </Field>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Como</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['PICKUP', 'DELIVERY'] as const).map((v) => (
                  <label
                    key={v}
                    className={cn(
                      'flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm',
                      entrega === v && 'border-primary bg-primary/10 font-medium',
                    )}
                  >
                    <input
                      type="radio"
                      name="fulfillment"
                      value={v}
                      checked={entrega === v}
                      onChange={() => setEntrega(v)}
                      className="sr-only"
                    />
                    {v === 'PICKUP' ? 'Cliente levanta' : 'Nós entregamos'}
                  </label>
                ))}
              </div>
            </fieldset>

            {entrega === 'DELIVERY' ? (
              <Field label="Morada" htmlFor="enc-morada">
                <Textarea id="enc-morada" name="address" rows={2} required />
              </Field>
            ) : null}

            <Field label="Canal" htmlFor="enc-canal" hint="Por onde chegou a encomenda.">
              <Select id="enc-canal" name="channelId" defaultValue={canalPadrao}>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notas" htmlFor="enc-notas">
              <Textarea
                id="enc-notas"
                name="notes"
                rows={2}
                placeholder="Escrever 'Parabéns Ana'. Sem lactose."
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>
            O preço vem da tabela. Escreva outro se combinou um diferente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {linhas.map((l, i) => {
            const p = porId.get(l.recipeId);
            return (
              <div
                key={l.key}
                className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end"
              >
                <Field label="Produto" htmlFor={`enc-p-${l.key}`} className="col-span-2 sm:col-span-1">
                  <Select
                    id={`enc-p-${l.key}`}
                    name={`linha.${i}.recipeId`}
                    value={l.recipeId}
                    onChange={(e) => mudarLinha(l.key, 'recipeId', e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {produtos.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Qtd." htmlFor={`enc-q-${l.key}`}>
                  <Input
                    id={`enc-q-${l.key}`}
                    name={`linha.${i}.qty`}
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => mudarLinha(l.key, 'qty', e.target.value)}
                    required
                  />
                </Field>
                <Field label="Preço un." htmlFor={`enc-v-${l.key}`}>
                  <Input
                    id={`enc-v-${l.key}`}
                    name={`linha.${i}.price`}
                    inputMode="decimal"
                    value={l.price}
                    onChange={(e) => mudarLinha(l.key, 'price', e.target.value)}
                    placeholder={
                      p?.listPrice != null
                        ? formatMoney(p.listPrice, currency).replace(/\s/g, ' ')
                        : 'preço'
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-end text-muted-foreground hover:text-destructive"
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Tirar esta linha</span>
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              setLinhas((ls) => [...ls, { key: proxima, recipeId: '', qty: '1', price: '' }]);
              setProxima((n) => n + 1);
            }}
          >
            <Plus className="h-4 w-4" />
            Outro produto
          </Button>

          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-right">
              <span className="block text-lg font-semibold tabular-nums">
                {formatMoney(total, currency)}
              </span>
              {Math.abs(tabela - total) > 0.005 ? (
                <span className="block text-xs text-muted-foreground">
                  tabela {formatMoney(tabela, currency)} ·{' '}
                  {tabela > total ? 'desconto' : 'acima'}{' '}
                  {formatMoney(Math.abs(tabela - total), currency)}
                </span>
              ) : null}
            </span>
          </div>
        </CardContent>
      </Card>

      {estado.message && !estado.ok ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{estado.message}</span>
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={aEnviar}>
        {aEnviar ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            A guardar…
          </>
        ) : (
          'Criar encomenda'
        )}
      </Button>
    </form>
  );
}
