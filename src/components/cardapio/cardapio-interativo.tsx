'use client';

/**
 * O cardapio publico, no telemovel primeiro.
 *
 * Mostra pouco e abre o detalhe quando se toca: a lista tem foto, nome, uma
 * linha e preco; o resto esta na folha do produto (`FolhaProduto`). Os textos
 * longos (massas, recheios, informacoes) estao fechados em secoes que se
 * abrem. Categorias em circulos, destaques no topo, abas que acendem ao
 * descer, e o pedido numa barra presa ao fundo (`BarraPedido`).
 *
 * O cliente escolhe quantidades so no browser e encomenda pelo WhatsApp. A
 * ultima escolha fica guardada no telemovel para "Repetir" na visita seguinte
 * (`lib/cardapio/pedido.ts`). Os precos chegam ja com IVA.
 *
 * Movimento: os itens aparecem com um fade, o carrinho "salta", a folha sobe —
 * tudo desligado com "reduzir movimento" (ver `cardapio.css`), e nada fica
 * escondido se o JavaScript nao correr (`data-anima` so liga depois).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, RotateCcw, X } from 'lucide-react';

import type { CardapioPublico, SecaoPublica } from '@/lib/cardapio/consultas';
import { CHAVE_ULTIMA, guardarUltima, lerUltima, repetivel } from '@/lib/cardapio/pedido';
import { precoRiscado } from '@/lib/pricing/cardapio';
import { useStoredString } from '@/lib/use-stored-state';
import { cn } from '@/lib/utils';
import { BarraPedido } from './barra-pedido';
import { Contexto, contarEvento, preco, useCardapio, type ContextoCardapio } from './contexto';
import { FolhaProduto } from './folha-produto';
import { CartaoDestaque, ItemCartao, ItemGaleria, ItemLinha } from './pecas-item';
import { TextoCardapio } from './texto-cardapio';

/** A foto em grande, por cima de tudo. Fecha no X, com Esc ou tocando fora. */
function FotoAmpliada({ foto, fechar }: { foto: { src: string; alt: string } | null; fechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (foto && !d.open) d.showModal();
    if (!foto && d.open) d.close();
  }, [foto]);
  return (
    <dialog
      ref={ref}
      onClose={fechar}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
      className="m-auto max-h-[92vh] max-w-[min(94vw,760px)] overflow-visible bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      {foto ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.src} alt={foto.alt} className="max-h-[88vh] w-auto rounded-2xl object-contain" />
          <button
            type="button"
            onClick={fechar}
            className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <p className="ab-serif mt-2 text-center text-lg text-white">{foto.alt}</p>
        </div>
      ) : null}
    </dialog>
  );
}

/** A secao visivel, para acender a aba certa ao descer. */
function useSecaoAtiva(ids: string[]): string | null {
  const [ativa, setAtiva] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const vista = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vista) setAtiva(vista.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids]);
  return ativa;
}

/** Liga as animacoes so depois de o JS correr, e revela os itens ao aparecerem. */
function useRevelar(raiz: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    el.setAttribute('data-anima', 'on');
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add('ab-visto');
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    const observar = () => el.querySelectorAll('.ab-revelar:not(.ab-visto)').forEach((n) => obs.observe(n));
    observar();
    const mo = new MutationObserver(observar);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      mo.disconnect();
    };
  }, [raiz]);
}

export function CardapioInterativo({
  dados,
  hoje,
  origem = 'direto',
  produtoInicial = null,
}: {
  dados: CardapioPublico;
  hoje: string;
  origem?: string;
  produtoInicial?: string | null;
}) {
  const [qtd, setQtd] = useState<Record<string, number>>({});
  // Link partilhado (`?p=<id>`): chega-se ja com a folha desse produto aberta.
  const [folha, setFolha] = useState<string | null>(() =>
    produtoInicial && dados.secoes.some((s) => s.itens.some((i) => i.id === produtoInicial)) ? produtoInicial : null,
  );
  const [ampliada, setAmpliada] = useState<{ src: string; alt: string } | null>(null);
  const [verTopo, setVerTopo] = useState(false);
  const [ultimaGuardada, setUltimaGuardada] = useStoredString(CHAVE_ULTIMA, '');
  const [repetirFechado, setRepetirFechado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const cfg = dados.currency;

  const itens = useMemo(() => new Map(dados.secoes.flatMap((s) => s.itens.map((i) => [i.id, i]))), [dados]);
  const item = useCallback((id: string) => itens.get(id), [itens]);

  const mudar = useCallback(
    (id: string, d: number) => setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(999, (q[id] ?? 0) + d)) })),
    [],
  );

  // A folha poe um passo no historico: o "voltar" do telemovel fecha-a em vez
  // de sair do cardapio.
  const abrirProduto = useCallback(
    (id: string) => {
      if (!itens.has(id)) return;
      contarEvento('OPEN', origem, id);
      if (folha) window.history.replaceState({ folha: true }, '', `#p-${id}`);
      else window.history.pushState({ folha: true }, '', `#p-${id}`);
      setFolha(id);
    },
    [itens, origem, folha],
  );
  const fecharFolha = useCallback(() => {
    if (window.history.state?.folha) window.history.back();
    else setFolha(null);
  }, []);
  useEffect(() => {
    const aoVoltar = () => setFolha(null);
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  // A folha que veio aberta do link tambem conta como aberta.
  const contouInicial = useRef(false);
  useEffect(() => {
    if (contouInicial.current || !produtoInicial || !itens.has(produtoInicial)) return;
    contouInicial.current = true;
    contarEvento('OPEN', origem, produtoInicial);
  }, [produtoInicial, itens, origem]);

  useEffect(() => {
    const aoRolar = () => setVerTopo(window.scrollY > window.innerHeight);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  useRevelar(raiz);

  const comItens = dados.secoes.filter((s) => s.itens.length > 0);
  const ids = useMemo(() => dados.secoes.map((s) => s.id), [dados]);
  const ativa = useSecaoAtiva(ids);
  const abas = useRef<HTMLUListElement>(null);
  useEffect(() => {
    abas.current?.querySelector(`[data-aba="${ativa}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [ativa]);

  const destaques = [...itens.values()].filter((i) => i.destaque && !i.esgotado);
  const ultima = lerUltima(ultimaGuardada);
  const disponivel = (id: string) => {
    const i = itens.get(id);
    return Boolean(i && !i.esgotado && !i.sobConsulta);
  };
  const algumEscolhido = Object.values(qtd).some((q) => q > 0);
  const mostrarRepetir = Boolean(dados.whatsapp && ultima && !algumEscolhido && !repetirFechado && Object.keys(ultima.itens).some(disponivel));

  const ctx: ContextoCardapio = {
    dados,
    hoje,
    cfg,
    origem,
    qtd,
    mudar: dados.whatsapp ? mudar : null,
    item,
    abrirProduto,
    abrirFoto: setAmpliada,
  };

  return (
    <Contexto value={ctx}>
      <div ref={raiz}>
        <FotoAmpliada foto={ampliada} fechar={() => setAmpliada(null)} />
        <FolhaProduto id={folha} fechar={fecharFolha} />

        {mostrarRepetir && ultima ? (
          <div className="ab-vidro mb-6 flex items-center gap-3 rounded-2xl border border-[var(--ab-linha)] p-3">
            <RotateCcw className="h-5 w-5 shrink-0 text-[var(--ab-titulo)]" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              Da última vez escolheu {Object.keys(ultima.itens).length}{' '}
              {Object.keys(ultima.itens).length === 1 ? 'produto' : 'produtos'}.
            </p>
            <button
              type="button"
              className="ab-botao px-4 py-2 text-sm"
              onClick={() => {
                const r = repetivel(ultima, disponivel);
                setQtd(r.qtd);
                setRepetirFechado(true);
                if (r.foraDe) setAviso(`${r.foraDe} ${r.foraDe === 1 ? 'produto já não está' : 'produtos já não estão'} disponível.`);
              }}
            >
              Repetir
            </button>
            <button type="button" onClick={() => setRepetirFechado(true)} aria-label="Dispensar" className="text-[var(--ab-texto-suave)]">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        {aviso ? <p className="mb-4 text-center text-sm text-[var(--ab-texto-suave)]">{aviso}</p> : null}

        {/* Categorias em circulos, como os destaques do Instagram. */}
        {comItens.length > 1 ? (
          <ul className="-mx-4 mb-6 flex snap-x gap-4 overflow-x-auto px-4 pb-2" aria-label="Categorias">
            {comItens.map((s) => {
              const foto = s.fotoMini ?? s.itens.find((i) => i.fotoMini)?.fotoMini ?? null;
              return (
                <li key={s.id} className="snap-start">
                  <a href={`#${s.id}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                    <span className="ab-circulo">
                      {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt="" loading="lazy" className="ab-foto h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="ab-serif flex h-full w-full items-center justify-center rounded-full bg-[var(--ab-cartao)] text-3xl text-[var(--ab-rosa)]">
                          {s.nome.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-xs leading-tight">{s.nome}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        {destaques.length ? (
          <section className="mb-8 space-y-3" aria-label="Destaques">
            <h2 className="ab-subtitulo text-base">Os preferidos</h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {destaques.map((i) => (
                <CartaoDestaque key={i.id} i={i} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Abas presas e translucidas; acendem conforme se desce. */}
        <nav aria-label="Secoes do cardapio" className="ab-vidro sticky top-0 z-20 -mx-4 mb-8 px-4 py-3">
          <ul ref={abas} className="flex gap-2 overflow-x-auto">
            {dados.secoes.map((s) => (
              <li key={s.id} data-aba={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={ativa === s.id ? 'true' : undefined}
                  className={cn(
                    'ab-serif block whitespace-nowrap rounded-full border px-4 py-1 transition-colors',
                    ativa === s.id
                      ? 'border-[var(--ab-pilula)] bg-[var(--ab-pilula)] text-[var(--ab-pilula-texto)]'
                      : 'border-[var(--ab-rosa)] text-[var(--ab-titulo)]',
                  )}
                >
                  {s.nome}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-14">
          {dados.secoes.map((s) => (
            <Secao key={s.id} s={s} />
          ))}
        </div>

        {verTopo ? (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="ab-tema ab-vidro fixed right-4 z-20 shadow-md"
            style={{ bottom: algumEscolhido ? '7rem' : '1.25rem' }}
            aria-label="Voltar ao topo"
          >
            <ArrowUp className="h-5 w-5" aria-hidden />
          </button>
        ) : null}

        <BarraPedido aoEncomendar={() => setUltimaGuardada(guardarUltima(qtd, hoje))} />
      </div>
    </Contexto>
  );
}

/** A descricao de uma secao: duas linhas e "ler mais" quando e comprida. */
function Descricao({ texto }: { texto: string | null }) {
  const [aberta, setAberta] = useState(false);
  if (!texto) return null;
  const comprida = texto.length > 160;
  return (
    <div>
      <div className={cn(comprida && !aberta && 'line-clamp-3')}>
        <TextoCardapio texto={texto} />
      </div>
      {comprida ? (
        <button type="button" onClick={() => setAberta((a) => !a)} className="mt-1 text-sm font-semibold text-[var(--ab-titulo)] underline underline-offset-2">
          {aberta ? 'ler menos' : 'ler mais'}
        </button>
      ) : null}
    </div>
  );
}

function Secao({ s }: { s: SecaoPublica }) {
  const { dados, hoje, cfg, abrirFoto } = useCardapio();
  // "VALOR: 25 €" no titulo quando todos custam o mesmo e nenhum esta em
  // promocao — como os Caseirinhos no PDF.
  const comPreco = s.itens.filter((i) => !i.sobConsulta);
  const precoUnico =
    s.layout === 'LIST' &&
    comPreco.length > 1 &&
    comPreco.every((i) => Math.abs(i.preco - comPreco[0].preco) < 0.005) &&
    comPreco.every((i) => !precoRiscado(i.id, i.preco, dados.promocoes, hoje))
      ? comPreco[0].preco
      : null;

  // So texto (Informacoes, Cuidados): a secao inteira fecha, e o titulo abre-a.
  if (s.layout === 'TEXT') {
    return (
      <section id={s.id} className="scroll-mt-20">
        <details className="ab-acordeao ab-acordeao-secao">
          <summary className="flex items-center justify-center gap-2">
            <span className="ab-pilula ab-serif text-2xl sm:text-3xl">{s.nome}</span>
            <ChevronDown className="ab-acordeao-seta h-5 w-5 text-[var(--ab-texto-suave)]" aria-hidden />
          </summary>
          <div className="space-y-4 pt-4">
            <TextoCardapio texto={s.descricao} />
            <TextoCardapio texto={s.corpo} fechado />
          </div>
        </details>
      </section>
    );
  }

  return (
    <section id={s.id} className="scroll-mt-20 space-y-5">
      <h2 className="text-center">
        <span className="ab-pilula ab-serif text-3xl sm:text-4xl">{s.nome}</span>
      </h2>

      {s.foto ? (
        <button
          type="button"
          onClick={() => abrirFoto({ src: s.foto!, alt: s.nome })}
          className="block w-full cursor-zoom-in"
          aria-label={`Ver a foto de ${s.nome} em grande`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.foto} alt="" loading="lazy" className="ab-foto aspect-[16/9] w-full rounded-3xl object-cover shadow-sm" />
        </button>
      ) : null}

      <Descricao texto={s.descricao} />

      {s.itens.length ? (
        <div className="space-y-3">
          {s.tituloDosItens || precoUnico !== null ? (
            <div className="flex items-baseline justify-between gap-4">
              {s.tituloDosItens ? <h3 className="ab-subtitulo text-lg">{s.tituloDosItens}</h3> : <span />}
              {precoUnico !== null ? (
                <p className="ab-serif whitespace-nowrap text-lg uppercase text-[var(--ab-titulo)]">Valor: {preco(precoUnico, cfg)}</p>
              ) : null}
            </div>
          ) : null}

          {s.layout === 'GALLERY' ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
              {s.itens.map((i) => (
                <li key={i.id}>
                  <ItemGaleria i={i} />
                </li>
              ))}
            </ul>
          ) : s.layout === 'CARDS' ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-6">
              {s.itens.map((i) => (
                <li key={i.id}>
                  <ItemCartao i={i} reservarFoto={s.itens.some((x) => x.fotoMini)} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-[var(--ab-linha)]">
              {s.itens.map((i) => (
                <li key={i.id} className="py-1">
                  <ItemLinha i={i} mostrarPreco={precoUnico === null} />
                </li>
              ))}
            </ul>
          )}

          <TextoCardapio texto={s.rodape} className="text-xs text-[var(--ab-texto-suave)]" />
        </div>
      ) : null}

      {s.destaque ? <p className="ab-faixa ab-serif text-sm">{s.destaque}</p> : null}

      <TextoCardapio texto={s.corpo} fechado />
    </section>
  );
}
