'use client';

/**
 * Escrever um preco e ver o que ele faz.
 *
 * O preco sugerido fica sempre a vista como referencia, e o campo ao lado
 * aceita o preco que se esta a pensar praticar. CMV, lucro e margem mudam
 * enquanto se escreve, com setas a dizer para onde foram em relacao ao
 * sugerido — e a tabela de canais acompanha.
 *
 * Tudo isto corre no browser, sem ida ao servidor, porque `src/lib/pricing/`
 * e matematica pura sem Prisma nem React. Foi desenhado assim na primeira
 * hora do projeto e e aqui que essa decisao se paga.
 */

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, RotateCcw } from 'lucide-react';

import { CmvBadge } from '@/components/cmv-badge';
import { DreBreakdown } from '@/components/dre-breakdown';
import { Alert } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/form-controls';
import {
  formatMoney,
  formatPercent,
  parseDecimal,
  type CurrencyConfig,
} from '@/lib/money';
import { simulateChannels, type GlobalSettings } from '@/lib/pricing/channels';
import { analyzeManualPrice } from '@/lib/pricing/price';
import type { ChannelInput, PricingMode, RecipeCost } from '@/lib/pricing/types';
import { cn } from '@/lib/utils';

export function PriceExplorer({
  cost,
  settings,
  channels,
  saved,
  currency,
}: {
  cost: RecipeCost;
  settings: GlobalSettings;
  channels: ChannelInput[];
  saved: {
    mode: PricingMode;
    manualPrice: number | null;
    targetCmv: number | null;
    targetMargin: number | null;
  };
  currency: CurrencyConfig;
}) {
  // O cenario guardado: o que a aplicacao recomenda com as regras deste
  // produto. Nao muda enquanto se mexe no campo — e a referencia.
  const sugerido = useMemo(
    () =>
      simulateChannels({
        cost,
        settings,
        channels,
        mode: saved.mode,
        manualPrice: saved.manualPrice,
        targetCmv: saved.targetCmv,
        targetMargin: saved.targetMargin,
      }),
    [cost, settings, channels, saved],
  );

  const precoSugerido = sugerido.reference.suggested;
  const [texto, setTexto] = useState(() =>
    precoSugerido.feasible ? String(precoSugerido.price) : '',
  );

  const preco = parseDecimal(texto);
  const mexido = Math.abs(preco - precoSugerido.price) > 0.0001;

  // O cenario que o utilizador esta a testar.
  const atual = useMemo(
    () =>
      simulateChannels({
        cost,
        settings,
        channels,
        mode: 'MANUAL',
        manualPrice: preco,
      }),
    [cost, settings, channels, preco],
  );

  // O simbolo sai da propria formatacao, para acompanhar a moeda escolhida
  // em vez de assumir euro.
  const simbolo = formatMoney(0, currency).replace(/[\d\s.,]/g, '') || '€';

  const ref = atual.reference;
  const resultado =
    preco > 0
      ? analyzeManualPrice(preco, ref.costs, ref.params)
      : ref.suggested;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------- o campo */}
      <div className="rounded-lg border bg-card p-4">
        {/* O sugerido e o campo lado a lado, do mesmo tamanho: sao a mesma
            grandeza e comparam-se de relance. A caixa ocupava a largura toda
            e parecia um campo de texto livre, nao um preco. */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Preco sugerido
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {precoSugerido.feasible
                ? formatMoney(precoSugerido.price, currency)
                : '—'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              em {sugerido.reference.channel.name}
            </p>
          </div>

          <div className="h-12 w-px self-center bg-border" aria-hidden />

          <div>
            <Label
              htmlFor="preco-venda"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Testar outro preco
            </Label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative">
                {/* Simbolo dentro do campo: deixa claro que se escreve um
                    valor, e encurta a caixa para o tamanho de um preco. */}
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                  {simbolo}
                </span>
                <Input
                  id="preco-venda"
                  inputMode="decimal"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="h-11 w-32 pl-8 text-lg font-semibold tabular-nums"
                />
              </div>

              {mexido ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTexto(String(precoSugerido.price))}
                  className="text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Repor
                </Button>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nada e guardado enquanto nao clicar em Guardar.
            </p>
          </div>
        </div>

        {/* -------------------------------------------------- os numeros */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          <Indicador
            label="CMV"
            valor={formatPercent(resultado.cmv, currency.locale)}
            antes={precoSugerido.cmv}
            depois={resultado.cmv}
            mexido={mexido}
            /* No CMV, subir e mau: mais custo para a mesma receita. */
            subirEBom={false}
            extra={<CmvBadge cmv={resultado.cmv} locale={currency.locale} />}
          />
          <Indicador
            label="Lucro por unidade"
            valor={formatMoney(resultado.profit, currency)}
            antes={precoSugerido.profit}
            depois={resultado.profit}
            mexido={mexido}
            subirEBom
            alerta={resultado.profit < 0}
          />
          <Indicador
            label="Margem liquida"
            valor={formatPercent(resultado.netMargin, currency.locale)}
            antes={precoSugerido.netMargin}
            depois={resultado.netMargin}
            mexido={mexido}
            subirEBom
          />
          <Indicador
            label="Receita liquida"
            valor={formatMoney(resultado.net, currency)}
            antes={precoSugerido.net}
            depois={resultado.net}
            mexido={mexido}
            subirEBom
          />
        </div>

        {resultado.profit < 0 && preco > 0 ? (
          <Alert tone="destructive" className="mt-4">
            A este preco cada unidade vendida da um prejuizo de{' '}
            <strong>{formatMoney(Math.abs(resultado.profit), currency)}</strong>.
          </Alert>
        ) : null}
      </div>

      {/* -------------------------------------------------- canais */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Nos outros canais</h2>
          <p className="text-sm text-muted-foreground">
            &quot;Mesmo lucro&quot; e quanto cobrar para levar para casa o mesmo
            dinheiro de {ref.channel.name}, nao a mesma percentagem.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">Canal</th>
                <th className="px-3 py-2.5 text-right font-medium">Comissao</th>
                <th className="px-3 py-2.5 text-right font-medium">Mesmo lucro</th>
                <th className="px-3 py-2.5 text-right font-medium">CMV</th>
                <th className="px-3 py-2.5 text-right font-medium">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {atual.results.map((r) => {
                const mostrado = r.profitMatched ?? r.suggested;
                const ehRef = r.channel.id === ref.channel.id;
                return (
                  <tr key={r.channel.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{r.channel.name}</span>
                      {ehRef ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          referencia
                        </span>
                      ) : null}
                      {r.channel.deliveryCost > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          frete {formatMoney(r.channel.deliveryCost, currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.channel.commissionRate > 0
                        ? formatPercent(r.channel.commissionRate, currency.locale, 0)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {r.profitMatchedPrice !== null
                        ? formatMoney(r.profitMatchedPrice, currency)
                        : 'inviavel'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <CmvBadge cmv={mostrado.cmv} locale={currency.locale} />
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        mostrado.profit < 0 && 'text-destructive',
                      )}
                    >
                      {formatMoney(mostrado.profit, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------- DRE */}
      <div className="rounded-lg border bg-card p-4">
        <DreBreakdown
          result={resultado}
          currency={currency}
          title={`Para onde vai cada centimo em ${ref.channel.name}`}
        />
      </div>
    </div>
  );
}

function Indicador({
  label,
  valor,
  antes,
  depois,
  mexido,
  subirEBom,
  alerta,
  extra,
}: {
  label: string;
  valor: string;
  antes: number;
  depois: number;
  mexido: boolean;
  subirEBom: boolean;
  alerta?: boolean;
  extra?: React.ReactNode;
}) {
  const delta = depois - antes;
  const parado = !mexido || Math.abs(delta) < 1e-9;
  const bom = delta > 0 === subirEBom;

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums',
          alerta && 'text-destructive',
        )}
      >
        {valor}
        {parado ? null : bom ? (
          <ArrowUpRight
            className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
            aria-label="melhorou"
          />
        ) : (
          <ArrowDownRight
            className="h-4 w-4 text-red-600 dark:text-red-400"
            aria-label="piorou"
          />
        )}
      </p>
      {parado ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" aria-hidden />
          igual ao sugerido
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">{extra ?? 'alterado'}</p>
      )}
    </div>
  );
}
