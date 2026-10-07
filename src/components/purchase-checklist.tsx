'use client';

/**
 * A lista de compras para usar dentro do supermercado.
 *
 * E o unico ecra desta aplicacao que se usa de pe, com uma mao, possivelmente
 * com o carrinho na outra. Por isso:
 *
 *  - uma lista so, uma linha por item (nome, quantidade, preco); a loja, o
 *    preciso/tenho/falta e a dica de preco abrem ao tocar na linha;
 *  - o circulo risca (ver `LinhaCompra`), e o que ja foi apanhado desce para
 *    "No carrinho", fechado: sai do caminho sem desaparecer, e desfaz-se la;
 *  - o cabecalho diz sempre quanto falta gastar, que e a pergunta que se faz
 *    a meio das compras;
 *  - o progresso fica guardado neste telemovel. Nao vai para o servidor: e
 *    conveniencia de quem esta a fazer a volta, nao um dado do negocio.
 *
 */

import { useMemo, useState } from 'react';
import { MapPin, Phone, Store, Tag } from 'lucide-react';

import { LinhaCompra, SecaoFechada } from '@/components/compras/linha-compra';
import { Paginacao } from '@/components/paginacao';
import { Button } from '@/components/ui/button';
import { formatMoney, type CurrencyConfig } from '@/lib/money';
import { pagina } from '@/lib/paginacao';
import { useStoredString } from '@/lib/use-stored-state';

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

/** Por comprar, por pagina. */
const POR_PAGINA = 20;

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

  // Uma lista so, sem grupos por loja: a loja aparece ao abrir o item. O que
  // falta fica no topo; o que ja esta no carrinho desce para uma secao fechada.
  const [aberto, setAberto] = useState<string | null>(null);
  const [pedida, setPedida] = useState(1);
  const lojaDe = useMemo(() => {
    const m = new Map<string, ChecklistGroup>();
    for (const g of groups) for (const i of g.items) m.set(i.id, g);
    return m;
  }, [groups]);
  const porFazer = todos.filter((i) => !checked.has(i.id));
  const noCarrinho = todos.filter((i) => checked.has(i.id));
  const p = pagina(porFazer.length, POR_PAGINA, pedida);

  const linha = (item: ChecklistItem) => {
    const feito = checked.has(item.id);
    const loja = lojaDe.get(item.id);
    return (
      <LinhaCompra
        key={item.id}
        nome={item.name}
        quantidade={item.buy}
        preco={item.cost}
        feito={feito}
        aberto={aberto === item.id}
        onRiscar={() => alternar(item.id)}
        onAbrir={() => setAberto((a) => (a === item.id ? null : item.id))}
      >
        {loja ? (
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {loja.supplier}
            </p>
            {loja.address ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                {loja.address}
              </p>
            ) : null}
            {loja.phone ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                <a href={`tel:${loja.phone}`} className="hover:underline">
                  {loja.phone}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {item.detail}
          {item.leftover ? ` · ${item.leftover}` : ''}
        </p>
        {item.betterPrice && !feito ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <Tag className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Em <strong>{item.betterPrice.supplier}</strong> poupava{' '}
              <strong>{item.betterPrice.saving}</strong> — {item.betterPrice.detail}
            </span>
          </p>
        ) : null}
      </LinhaCompra>
    );
  };

  return (
    <div className="space-y-3">
      {/* Uma linha de progresso, colada ao topo enquanto se rola. */}
      <div className="sticky top-14 z-10 rounded-lg border bg-background/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            <strong className="tabular-nums">
              {feitos} de {todos.length}
            </strong>{' '}
            <span className="text-muted-foreground">
              {tudoFeito ? (
                '· compra completa'
              ) : (
                <>
                  · faltam <span className="tabular-nums">{formatMoney(restante, currency)}</span>
                </>
              )}
            </span>
          </p>
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
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
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

      {porFazer.length > 0 ? (
        <section className="rounded-lg border bg-card" aria-label="Por comprar">
          <ul className="divide-y">{porFazer.slice(p.inicio, p.fim).map(linha)}</ul>
          <Paginacao p={p} onChange={setPedida} className="border-t px-4 py-2" />
        </section>
      ) : null}
      <SecaoFechada titulo="No carrinho" n={noCarrinho.length}>
        {noCarrinho.map(linha)}
      </SecaoFechada>
    </div>
  );
}
