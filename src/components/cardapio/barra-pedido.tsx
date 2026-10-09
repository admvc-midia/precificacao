'use client';

/**
 * A barra do pedido, presa ao fundo: miniaturas do que se escolheu, total
 * estimado e "Encomendar" (abre o WhatsApp com a lista). Tocar no resumo
 * abre a lista para ajustar quantidades e escrever um cupao.
 *
 * O numero de itens "salta" a cada mudanca (desligado com reduzir movimento).
 */

import { useState } from 'react';
import { ChevronUp, MessageCircle } from 'lucide-react';

import { mensagemDoCardapio, precoDaLinha } from '@/lib/pricing/cardapio';
import { linkWhatsApp } from '@/lib/pricing/clientes';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { contarEvento, useCardapio } from './contexto';
import { Miniatura, Quantidade } from './pecas-item';

export function BarraPedido({ aoEncomendar }: { aoEncomendar: () => void }) {
  const { dados, qtd, item, hoje, cfg, origem } = useCardapio();
  const [aberta, setAberta] = useState(false);
  const [cupao, setCupao] = useState('');
  if (!dados.whatsapp) return null;

  const escolhidos = Object.entries(qtd)
    .filter(([id, q]) => q > 0 && item(id))
    .map(([id, q]) => {
      const it = item(id)!;
      return { it, nome: it.nome, qty: q, total: precoDaLinha(id, it.preco, q, dados.promocoes, hoje).total };
    });
  const total = escolhidos.reduce((a, i) => a + i.total, 0);
  const unidades = escolhidos.reduce((a, i) => a + i.qty, 0);
  const visivel = unidades > 0;

  return (
    <div
      className="ab-barra ab-vidro fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ab-linha)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      // Vazia: desce para fora do ecra e fica invisivel (sem foco nem toque).
      style={{
        transform: visivel ? 'none' : 'translateY(110%)',
        visibility: visivel ? 'visible' : 'hidden',
        transition: `transform 200ms ease, visibility 0s linear ${visivel ? '0s' : '200ms'}`,
      }}
      aria-hidden={!visivel}
    >
      <div className="mx-auto max-w-2xl space-y-3">
        {aberta && visivel ? (
          <div className="max-h-[45vh] space-y-3 overflow-y-auto pb-1">
            <ul className="space-y-2">
              {escolhidos.map(({ it, qty, total: t }) => (
                <li key={it.id} className="flex items-center gap-3">
                  <Miniatura i={it} className="h-11 w-11 shrink-0 rounded-xl text-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="ab-serif block truncate text-lg leading-tight">{it.nome}</span>
                    <span className="text-xs text-[var(--ab-texto-suave)]">
                      {qty} × · {formatMoney(t, cfg)}
                    </span>
                  </span>
                  <Quantidade i={it} />
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-sm text-[var(--ab-texto-suave)]">
              Tem um cupão?
              <input
                value={cupao}
                onChange={(e) => setCupao(e.target.value.toUpperCase())}
                tabIndex={visivel ? undefined : -1}
                maxLength={30}
                autoComplete="off"
                autoCapitalize="characters"
                className="w-36 rounded-full border border-[var(--ab-rosa)] bg-[var(--ab-campo)] px-3 py-1 text-sm uppercase text-[var(--ab-texto)]"
                placeholder="CÓDIGO"
              />
            </label>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAberta((a) => !a)}
            tabIndex={visivel ? undefined : -1}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={aberta}
            aria-label={aberta ? 'Fechar o pedido' : 'Ver e ajustar o pedido'}
          >
            <span className="flex -space-x-3" aria-hidden>
              {escolhidos.slice(0, 3).map(({ it }) => (
                <Miniatura key={it.id} i={it} className="h-10 w-10 rounded-full border-2 border-[var(--ab-fundo)] text-base" />
              ))}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-xs text-[var(--ab-texto-suave)]">
                <span key={unidades} className="ab-salto inline-block rounded-full bg-[var(--ab-botao)] px-1.5 font-semibold text-[var(--ab-botao-texto)]">
                  {unidades}
                </span>
                {unidades === 1 ? 'item' : 'itens'} · estimado
                <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-180')} aria-hidden />
              </span>
              <span className="ab-serif block text-2xl leading-tight text-[var(--ab-titulo)]">{formatMoney(total, cfg)}</span>
            </span>
          </button>
          <a
            href={linkWhatsApp(dados.whatsapp, mensagemDoCardapio(escolhidos, cupao, cfg))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              contarEvento('ORDER', origem);
              aoEncomendar();
            }}
            tabIndex={visivel ? undefined : -1}
            className="ab-botao inline-flex items-center gap-2 px-5 py-3 text-sm"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Encomendar
          </a>
        </div>
      </div>
    </div>
  );
}
