'use client';

/**
 * Restaurar uma copia, em dois passos: escolher o ficheiro (a app le-o e
 * mostra o que muda, sem tocar em nada) e confirmar escrevendo RESTAURAR.
 *
 * O ficheiro fica guardado no estado do componente e vai outra vez no segundo
 * passo. Um `<form action>` seria reposto pelo React depois do primeiro envio
 * e o ficheiro escolhido perdia-se — por isso os envios sao feitos a mao.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCcw, XCircle } from 'lucide-react';

import type { AnaliseState } from '@/lib/actions/copia';
import { analisarCopiaAction, restaurarCopiaAction } from '@/lib/actions/copia';
import type { ActionState } from '@/lib/actions/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Nome de cada tabela como se diz na app. As que faltarem aparecem pelo nome tecnico. */
const ROTULO: Record<string, string> = {
  Settings: 'Configurações',
  Expense: 'Despesas',
  Supplier: 'Fornecedores',
  Ingredient: 'Insumos',
  PriceQuote: 'Cotações de preço',
  SupplierOffer: 'Preços por fornecedor',
  Recipe: 'Fichas técnicas',
  RecipeItem: 'Linhas das fichas',
  SalesChannel: 'Canais de venda',
  ProductionOrder: 'Ordens de produção',
  ProductionOrderLine: 'Linhas das ordens',
  PurchaseListLine: 'Linhas de compra das ordens',
  StockMovement: 'Movimentos de estoque',
  ShoppingList: 'Listas de compras',
  ShoppingItem: 'Itens das listas',
  Customer: 'Clientes',
  CustomerOrder: 'Encomendas',
  CustomerOrderLine: 'Linhas das encomendas',
  Reminder: 'Lembretes',
  Cookbook: 'Livros de receitas',
  CookbookEntry: 'Receitas nos livros',
  BookRecipe: 'Receitas do livro',
  BookRecipeVersion: 'Versões das receitas',
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'long', timeStyle: 'short' });

function Mensagem({ estado }: { estado: ActionState }) {
  if (!estado.message) return null;
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        estado.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
          : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
      )}
    >
      {estado.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <span>{estado.message}</span>
    </p>
  );
}

export function RestaurarCopia() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseState | null>(null);
  const [resultado, setResultado] = useState<ActionState>({ ok: true });
  const [confirmacao, setConfirmacao] = useState('');
  const [aLer, lerEmTransicao] = useTransition();
  const [aRestaurar, restaurarEmTransicao] = useTransition();

  function escolher(f: File | null) {
    setFicheiro(f);
    setAnalise(null);
    setConfirmacao('');
    setResultado({ ok: true });
    if (!f) return;
    const dados = new FormData();
    dados.set('ficheiro', f);
    lerEmTransicao(async () => setAnalise(await analisarCopiaAction({ ok: true }, dados)));
  }

  function restaurar() {
    if (!ficheiro) return;
    const dados = new FormData();
    dados.set('ficheiro', ficheiro);
    dados.set('confirmacao', confirmacao);
    restaurarEmTransicao(async () => {
      const r = await restaurarCopiaAction({ ok: true }, dados);
      setResultado(r);
      if (r.ok) {
        setFicheiro(null);
        setAnalise(null);
        setConfirmacao('');
        if (entrada.current) entrada.current.value = '';
        router.refresh();
      }
    });
  }

  const tabelas = (analise?.ok ? analise.tabelas : undefined) ?? [];
  const visiveis = tabelas.filter((t) => t.agora > 0 || t.naCopia > 0);
  const perdidas = tabelas.filter((t) => t.depoisDaCopia > 0);
  const podeRestaurar = Boolean(analise?.ok && ficheiro) && confirmacao.trim().toUpperCase() === 'RESTAURAR';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="ficheiro-copia" className="text-sm font-medium">
          Ficheiro da cópia (.json)
        </label>
        <Input
          id="ficheiro-copia"
          ref={entrada}
          type="file"
          accept="application/json,.json"
          disabled={aLer || aRestaurar}
          onChange={(e) => escolher(e.currentTarget.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Escolher o ficheiro não muda nada: primeiro a app mostra o que ia mudar.
        </p>
      </div>

      {aLer ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />A ler a cópia…
        </p>
      ) : null}

      {analise && !analise.ok ? <Mensagem estado={analise} /> : null}

      {analise?.ok ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm">
            <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Cópia de <strong>{quando(analise.gravadoEm!)}</strong> (versão {analise.versao}).
            </span>
          </p>

          {perdidas.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Perde-se o que foi criado depois da cópia —{' '}
                {perdidas.map((t) => `${ROTULO[t.modelo] ?? t.modelo}: ${t.depoisDaCopia}`).join(' · ')}.
              </span>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">O que</th>
                  <th className="px-3 py-2 text-right font-medium">Agora</th>
                  <th className="px-3 py-2 text-right font-medium">Fica (da cópia)</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((t) => (
                  <tr key={t.modelo} className="border-t">
                    <td className="px-3 py-1.5">{ROTULO[t.modelo] ?? t.modelo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.agora}</td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right tabular-nums',
                        t.naCopia < t.agora && 'font-semibold text-red-700 dark:text-red-400',
                      )}
                    >
                      {t.naCopia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analise.avisos && analise.avisos.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {analise.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-muted-foreground">
            As contas, as palavras-passe e o registo de alterações ficam como estão. Antes de
            restaurar, a app guarda uma cópia do que há agora — se for engano, restaura-se essa.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="confirmacao-copia" className="text-sm font-medium">
              Para confirmar, escreva RESTAURAR
            </label>
            <Input
              id="confirmacao-copia"
              value={confirmacao}
              autoComplete="off"
              disabled={aRestaurar}
              onChange={(e) => setConfirmacao(e.currentTarget.value)}
              className="max-w-xs"
            />
          </div>

          <Button variant="destructive" disabled={!podeRestaurar || aRestaurar} onClick={restaurar}>
            {aRestaurar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />A restaurar…
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restaurar esta cópia
              </>
            )}
          </Button>
        </div>
      ) : null}

      <Mensagem estado={resultado} />
    </div>
  );
}
