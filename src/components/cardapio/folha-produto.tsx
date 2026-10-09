'use client';

/**
 * A folha de um produto: sobe de baixo por cima do cardapio (que fica
 * desfocado), com tudo o que a lista nao mostra — foto grande (toque: zoom),
 * descricao completa, o que leva, alergenios, quantidade, "Combina com…" e
 * partilhar.
 *
 * Fecha no X, tocando fora, a deslizar para baixo, ou com o "voltar" do
 * telemovel (quem abre a folha poe um `#p-<id>` no historico; ver
 * `CardapioInterativo`).
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';

import type { ItemPublico } from '@/lib/cardapio/consultas';
import { precoDaLinha } from '@/lib/pricing/cardapio';
import { contarEvento, preco, useCardapio, vibrar } from './contexto';
import { Miniatura, PrecoDoItem, Quantidade, SeloDestaque } from './pecas-item';

function Alergenios({ i }: { i: ItemPublico }) {
  const { presentes, completo } = i.alergenios;
  return (
    <p className="text-sm text-[var(--ab-texto-suave)]">
      <span className="font-semibold text-[var(--ab-texto)]">Alergénios: </span>
      {presentes.length ? `contém ${presentes.join(', ').toLowerCase()}.` : completo ? 'sem alergénios declarados.' : ''}
      {completo ? '' : ' Informação ainda incompleta — pergunte-nos antes de encomendar.'}
    </p>
  );
}

function Partilhar({ i }: { i: ItemPublico }) {
  const [copiado, setCopiado] = useState(false);
  const partilhar = async () => {
    const url = `${window.location.origin}/cardapio?p=${i.id}&o=wa`;
    try {
      if (navigator.share) {
        await navigator.share({ title: i.nome, text: `${i.nome} — AmoBrigs Confeitaria`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // A pessoa desistiu de partilhar: nada a fazer.
    }
  };
  return (
    <button type="button" onClick={partilhar} className="ab-tema" aria-label={`Partilhar ${i.nome}`} title="Partilhar">
      {copiado ? <Check className="h-5 w-5" aria-hidden /> : <Share2 className="h-5 w-5" aria-hidden />}
    </button>
  );
}

export function FolhaProduto({ id, fechar }: { id: string | null; fechar: () => void }) {
  const { item, cfg, qtd, mudar, dados, hoje, abrirFoto, abrirProduto, origem } = useCardapio();
  const ref = useRef<HTMLDialogElement>(null);
  const [puxar, setPuxar] = useState(0);
  const inicio = useRef<number | null>(null);
  const i = id ? item(id) : undefined;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (i && !d.open) d.showModal();
    if (!i && d.open) d.close();
  }, [i]);

  // Ao trocar de produto ("Combina com"), volta ao topo da folha.
  useEffect(() => {
    ref.current?.querySelector('[data-rolo]')?.scrollTo({ top: 0 });
  }, [id]);

  const q = i ? (qtd[i.id] ?? 0) : 0;
  const total = i && q > 0 ? precoDaLinha(i.id, i.preco, q, dados.promocoes, hoje).total : 0;
  const pares = (i?.combinaCom ?? []).map((x) => item(x)).filter((x): x is ItemPublico => Boolean(x));

  return (
    <dialog
      ref={ref}
      onClose={fechar}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
      aria-label={i?.nome}
      className="ab-folha"
      style={puxar ? { transform: `translateY(${puxar}px)`, transition: 'none' } : undefined}
    >
      {i ? (
        <div className="flex max-h-[88vh] flex-col">
          {/* A pega: arrastar para baixo fecha. */}
          <div
            className="flex cursor-grab justify-center pb-1 pt-2"
            onTouchStart={(e) => (inicio.current = e.touches[0].clientY)}
            onTouchMove={(e) => inicio.current !== null && setPuxar(Math.max(0, e.touches[0].clientY - inicio.current))}
            onTouchEnd={() => {
              if (puxar > 90) fechar();
              setPuxar(0);
              inicio.current = null;
            }}
          >
            <span className="h-1.5 w-12 rounded-full bg-[var(--ab-linha)]" aria-hidden />
          </div>

          <div data-rolo className="overflow-y-auto px-5 pb-4">
            <div className="relative">
              {i.foto ? (
                <button
                  type="button"
                  onClick={() => abrirFoto({ src: i.foto!, alt: i.nome })}
                  className="block w-full cursor-zoom-in"
                  aria-label={`Ver a foto de ${i.nome} em grande`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.foto} alt={i.nome} className="ab-foto aspect-[4/3] w-full rounded-3xl object-cover" />
                </button>
              ) : (
                <Miniatura i={i} className="aspect-[4/3] w-full rounded-3xl text-7xl" />
              )}
              <div className="absolute right-3 top-3 flex gap-2">
                <Partilhar i={i} />
                <button type="button" onClick={fechar} className="ab-tema" aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="ab-serif text-3xl leading-tight">{i.nome}</h2>
                <SeloDestaque i={i} />
              </div>
              <PrecoDoItem i={i} tamanho="grande" />
              {i.unidade ? <p className="text-sm text-[var(--ab-texto-suave)]">{i.unidade}</p> : null}
              {i.descricao ? <p className="leading-relaxed">{i.descricao}</p> : null}
              {i.leva.length ? <p className="text-sm">Leva {i.leva.join(', ')}.</p> : null}
              <Alergenios i={i} />
            </div>

            {pares.length ? (
              <div className="space-y-2 pt-6">
                <h3 className="ab-subtitulo text-base">Combina com</h3>
                <ul className="space-y-2">
                  {pares.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <button type="button" onClick={() => abrirProduto(p.id)} className="ab-toque flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left">
                        <Miniatura i={p} className="h-14 w-14 shrink-0 rounded-xl text-2xl" />
                        <span className="min-w-0">
                          <span className="ab-serif block truncate text-lg">{p.nome}</span>
                          <PrecoDoItem i={p} tamanho="pequeno" />
                        </span>
                      </button>
                      <Quantidade i={p} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* O pe da folha: quantidade e juntar, sempre a vista. */}
          {mudar && !i.esgotado && !i.sobConsulta ? (
            <div className="flex items-center gap-3 border-t border-[var(--ab-linha)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {q > 0 ? (
                <>
                  <Quantidade i={i} grande />
                  <button type="button" onClick={fechar} className="ab-botao ml-auto px-5 py-3 text-sm">
                    No pedido · {preco(total, cfg)}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    mudar(i.id, 1);
                    vibrar();
                    contarEvento('ADD', origem, i.id);
                  }}
                  className="ab-botao w-full px-5 py-3 text-base"
                >
                  Juntar ao pedido
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-center border-t border-[var(--ab-linha)] px-5 py-3">
              <Quantidade i={i} grande />
            </div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
