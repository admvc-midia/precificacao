'use client';

/**
 * A lista de compras para usar dentro do supermercado.
 *
 * E o unico ecra desta aplicacao que se usa de pe, com uma mao, possivelmente
 * com o carrinho na outra. Por isso:
 *
 *  - cada item risca-se com um toque, e o alvo de toque e a linha inteira,
 *    nao o quadradinho;
 *  - o que ja foi apanhado esvanece mas nao desaparece — precisa de se poder
 *    desfazer, e ver o que ja esta no carrinho tranquiliza;
 *  - o cabecalho diz sempre quanto falta gastar, que e a pergunta que se faz
 *    a meio das compras;
 *  - o progresso fica guardado neste telemovel. Nao vai para o servidor: e
 *    conveniencia de quem esta a fazer a volta, nao um dado do negocio.
 *
 * Uma unica marcacao serve os dois tamanhos: os detalhes (preciso/tenho/falta)
 * vao numa segunda linha que se quebra sozinha no telemovel.
 */

import { useMemo } from 'react';
import { Check, MapPin, Phone, Store, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatMoney, type CurrencyConfig } from '@/lib/money';
import { useStoredString } from '@/lib/use-stored-state';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  id: string;
  name: string;
  /** "4x 5 kg" — o que se poe no carrinho. */
  buy: string;
  /** Custo ja formatado na moeda. */
  cost: string;
  /** O mesmo custo em numero, para somar o que falta. */
  costValue: number;
  /** "preciso 16 kg · tenho 8 kg · falta 8 kg" */
  detail: string;
  /** "sobram 3,4 kg" quando a embalagem obriga a levar a mais. */
  leftover?: string;
  /**
   * Dica de onde ficava mais barato, quando ha outro fornecedor com melhor
   * preco **para esta quantidade** — que nem sempre e o mais barato por grama.
   */
  betterPrice?: { supplier: string; saving: string; detail: string };
}

export interface ChecklistGroup {
  id: string;
  supplier: string;
  address?: string | null;
  phone?: string | null;
  total: string;
  items: ChecklistItem[];
}

export function PurchaseChecklist({
  orderId,
  groups,
  currency,
}: {
  orderId: string;
  groups: ChecklistGroup[];
  /**
   * A configuracao de moeda, nao uma funcao de formatacao: funcoes nao
   * atravessam a fronteira servidor -> cliente. O `formatMoney` e puro e
   * importa-se dos dois lados.
   */
  currency: CurrencyConfig;
}) {
  const storageKey = `precificaragao:compras:${orderId}`;
  const [guardado, guardar] = useStoredString(storageKey, '[]');

  const checked = useMemo(() => {
    try {
      const lista = JSON.parse(guardado) as unknown;
      return new Set(Array.isArray(lista) ? (lista as string[]) : []);
    } catch {
      // Conteudo corrompido: comeca tudo por riscar em vez de rebentar.
      return new Set<string>();
    }
  }, [guardado]);

  const todos = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Itens riscados que ja nao existem na lista (o utilizador mexeu na ordem)
  // sao simplesmente ignorados, em vez de contarem para o progresso.
  const validos = useMemo(
    () => todos.filter((i) => checked.has(i.id)),
    [todos, checked],
  );

  const feitos = validos.length;
  const restante = todos.reduce(
    (acc, i) => acc + (checked.has(i.id) ? 0 : i.costValue),
    0,
  );

  function alternar(id: string) {
    const proximo = new Set(checked);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    guardar(JSON.stringify([...proximo]));
  }

  const tudoFeito = todos.length > 0 && feitos === todos.length;

  return (
    <div className="space-y-4">
      {/* Cabecalho de progresso: fica colado ao topo enquanto se rola, porque
          e a informacao que se quer consultar a meio das compras. */}
      <div className="sticky top-14 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {feitos} de {todos.length} itens no carrinho
            </p>
            <p className="text-xs text-muted-foreground">
              {tudoFeito ? (
                'Compra completa.'
              ) : (
                <>
                  faltam gastar{' '}
                  <strong className="tabular-nums">
                    {formatMoney(restante, currency)}
                  </strong>
                </>
              )}
            </p>
          </div>
          {feitos > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => guardar('[]')}
              className="shrink-0 text-muted-foreground"
            >
              Limpar
            </Button>
          ) : null}
        </div>

        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={feitos}
          aria-valuemin={0}
          aria-valuemax={todos.length}
          aria-label="Itens ja apanhados"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${todos.length ? (feitos / todos.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {groups.map((group) => {
        const porFazer = group.items.filter((i) => !checked.has(i.id)).length;

        return (
          <section key={group.id} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/40 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {group.supplier}
                  {porFazer === 0 ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-label="loja completa" />
                  ) : null}
                </p>
                {group.address ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    {group.address}
                  </p>
                ) : null}
                {group.phone ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" aria-hidden />
                    <a href={`tel:${group.phone}`} className="hover:underline">
                      {group.phone}
                    </a>
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 tabular-nums font-medium">{group.total}</span>
            </div>

            <ul className="divide-y">
              {group.items.map((item) => {
                const feito = checked.has(item.id);
                return (
                  <li key={item.id}>
                    {/* A linha inteira e o alvo de toque — um quadradinho de
                        16px nao se acerta com o polegar a andar. */}
                    <label
                      className={cn(
                        'flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40',
                        feito && 'bg-muted/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={feito}
                        onChange={() => alternar(item.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-primary"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span
                            className={cn(
                              'font-medium',
                              feito && 'text-muted-foreground line-through',
                            )}
                          >
                            {item.name}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 tabular-nums',
                              feito ? 'text-muted-foreground line-through' : 'font-medium',
                            )}
                          >
                            {item.cost}
                          </span>
                        </div>

                        <p
                          className={cn(
                            'mt-0.5 text-sm',
                            feito ? 'text-muted-foreground' : 'text-foreground',
                          )}
                        >
                          {item.buy}
                        </p>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.detail}
                          {item.leftover ? ` · ${item.leftover}` : ''}
                        </p>

                        {item.betterPrice && !feito ? (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <Tag className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            <span>
                              Em <strong>{item.betterPrice.supplier}</strong> poupava{' '}
                              <strong>{item.betterPrice.saving}</strong> —{' '}
                              {item.betterPrice.detail}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
