'use client';

/**
 * O cardapio publico: secoes, itens, quantidades e o botao do WhatsApp.
 *
 * O cliente escolhe quantidades so no browser (nada vai para o servidor) e o
 * botao abre o WhatsApp da casa com a lista, o total estimado e o cupao
 * escrito. O total e "estimado" de proposito: a encomenda e confirmada na
 * conversa, e o cupao so e conferido quando a casa a regista.
 *
 * Os precos chegam ja com IVA (`getCardapioPublico`).
 */

import { createContext, use, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Minus, Plus, X } from 'lucide-react';

import { TextoCardapio } from '@/components/cardapio/texto-cardapio';
import type { CardapioPublico, ItemPublico, SecaoPublica } from '@/lib/cardapio/consultas';
import { formatMoney, type CurrencyConfig } from '@/lib/money';
import {
  descreverPromocao,
  mensagemDoCardapio,
  precoDaLinha,
  precoRiscado,
  promocoesDeQuantidade,
  type PromocaoInput,
} from '@/lib/pricing/cardapio';
import { linkWhatsApp } from '@/lib/pricing/clientes';

/** Abre uma foto em grande (a `<dialog>` vive no `CardapioInterativo`). */
const AbrirFoto = createContext<(f: { src: string; alt: string }) => void>(() => {});

/**
 * Uma foto que se toca para ver em grande. `mini` e a que se mostra (a
 * miniatura, nas listas); `grande` a que abre.
 */
function Foto({ mini, grande, alt, className }: { mini: string; grande: string | null; alt: string; className?: string }) {
  const abrir = use(AbrirFoto);
  return (
    <button
      type="button"
      onClick={() => abrir({ src: grande ?? mini, alt })}
      className="block shrink-0 cursor-zoom-in"
      aria-label={`Ver a foto de ${alt} em grande`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- rota propria, sem otimizador */}
      <img src={mini} alt={alt} loading="lazy" className={className} />
    </button>
  );
}

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
      className="m-auto max-h-[92vh] max-w-[min(92vw,720px)] overflow-visible bg-transparent p-0 backdrop:bg-black/75"
    >
      {foto ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.src} alt={foto.alt} className="max-h-[88vh] w-auto rounded-2xl object-contain" />
          <button
            type="button"
            onClick={fechar}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
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

/** "25,00 €" → "25 €", como no PDF, quando nao ha centimos. */
function preco(v: number, cfg: CurrencyConfig): string {
  const s = formatMoney(v, cfg);
  return Number.isInteger(Math.round(v * 100) / 100) ? s.replace(/[,.]00(?=\D|$)/, '') : s;
}

/** Conta um clique (sem dados da pessoa). `sendBeacon` sobrevive a ida para o WhatsApp. */
function contarClique(e: 'ORDER' | 'QUOTE', origem: string) {
  try {
    navigator.sendBeacon?.('/api/cardapio/evento', JSON.stringify({ e, o: origem }));
  } catch {
    // Uma estatistica nunca impede de encomendar.
  }
}

/** A origem da visita, para os cliques contarem no mesmo canal. */
const Origem = createContext('direto');

export function CardapioInterativo({ dados, hoje, origem = 'direto' }: { dados: CardapioPublico; hoje: string; origem?: string }) {
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [cupao, setCupao] = useState('');
  const [ampliada, setAmpliada] = useState<{ src: string; alt: string } | null>(null);
  const cfg = dados.currency;
  const podeEncomendar = Boolean(dados.whatsapp);

  const itens = useMemo(() => new Map(dados.secoes.flatMap((s) => s.itens.map((i) => [i.id, i]))), [dados]);

  const escolhidos = Object.entries(qtd)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => {
      const it = itens.get(id)!;
      return { nome: it.nome, qty: q, total: precoDaLinha(id, it.preco, q, dados.promocoes, hoje).total };
    });
  const total = escolhidos.reduce((a, i) => a + i.total, 0);
  const unidades = escolhidos.reduce((a, i) => a + i.qty, 0);

  const mudar = (id: string, d: number) =>
    setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(999, (q[id] ?? 0) + d)) }));

  return (
    <Origem value={origem}>
    <AbrirFoto value={setAmpliada}>
      <FotoAmpliada foto={ampliada} fechar={() => setAmpliada(null)} />
      <nav aria-label="Secoes do cardapio" className="sticky top-0 z-20 -mx-4 mb-8 overflow-x-auto bg-[var(--ab-fundo)] px-4 py-3 backdrop-blur">
        <ul className="flex gap-2">
          {dados.secoes.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="ab-serif block whitespace-nowrap rounded-full border border-[var(--ab-rosa)] px-4 py-1 text-[var(--ab-titulo)] hover:bg-[var(--ab-pilula)] hover:text-[var(--ab-pilula-texto)]"
              >
                {s.nome}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-16">
        {dados.secoes.map((s) => (
          <Secao
            key={s.id}
            s={s}
            cfg={cfg}
            promocoes={dados.promocoes}
            hoje={hoje}
            qtd={qtd}
            mudar={podeEncomendar ? mudar : null}
            whatsapp={dados.whatsapp}
          />
        ))}
      </div>

      {podeEncomendar ? (
        <div
          className="ab-barra fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ab-rosa)] bg-[var(--ab-fundo)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(91,28,50,0.15)]"
          style={{ transform: unidades > 0 ? 'none' : 'translateY(110%)' }}
          aria-hidden={unidades === 0}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--ab-texto-suave)]">
                  {unidades} {unidades === 1 ? 'item' : 'itens'} · total estimado
                </p>
                <p className="ab-serif text-2xl text-[var(--ab-titulo)]">{formatMoney(total, cfg)}</p>
              </div>
              <a
                href={linkWhatsApp(dados.whatsapp!, mensagemDoCardapio(escolhidos, cupao, cfg))}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => contarClique('ORDER', origem)}
                tabIndex={unidades === 0 ? -1 : undefined}
                className="ab-botao inline-flex items-center gap-2 px-5 py-3 text-sm"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Encomendar
              </a>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--ab-texto-suave)]">
              Tem um cupão?
              <input
                value={cupao}
                onChange={(e) => setCupao(e.target.value.toUpperCase())}
                tabIndex={unidades === 0 ? -1 : undefined}
                maxLength={30}
                autoComplete="off"
                autoCapitalize="characters"
                className="w-36 rounded-full border border-[var(--ab-rosa)] bg-[var(--ab-campo)] px-3 py-1 text-sm uppercase text-[var(--ab-texto)]"
                placeholder="CÓDIGO"
              />
            </label>
          </div>
        </div>
      ) : null}
    </AbrirFoto>
    </Origem>
  );
}

function Secao({
  s,
  cfg,
  promocoes,
  hoje,
  qtd,
  mudar,
  whatsapp,
}: {
  s: SecaoPublica;
  cfg: CurrencyConfig;
  promocoes: PromocaoInput[];
  hoje: string;
  qtd: Record<string, number>;
  mudar: ((id: string, d: number) => void) | null;
  whatsapp: string | null;
}) {
  // "VALOR: 25€" no titulo quando todos custam o mesmo e nenhum esta em
  // promocao — como os Caseirinhos no PDF.
  const comPreco = s.itens.filter((i) => !i.sobConsulta);
  const precoUnico =
    s.layout === 'LIST' &&
    comPreco.length > 1 &&
    comPreco.every((i) => Math.abs(i.preco - comPreco[0].preco) < 0.005) &&
    comPreco.every((i) => !precoRiscado(i.id, i.preco, promocoes, hoje))
      ? comPreco[0].preco
      : null;

  return (
    <section id={s.id} className="scroll-mt-20 space-y-6">
      <h2 className="text-center">
        <span className="ab-pilula ab-serif text-4xl sm:text-5xl">{s.nome}</span>
      </h2>

      {s.foto ? (
        <Foto
          mini={s.foto}
          grande={s.foto}
          alt={s.nome}
          className="aspect-[4/3] w-full rounded-3xl object-cover shadow-sm sm:aspect-[16/9]"
        />
      ) : null}

      <TextoCardapio texto={s.descricao} />

      {s.itens.length ? (
        <div className="space-y-5">
          {s.tituloDosItens || precoUnico !== null ? (
            <div className="flex items-baseline justify-between gap-4">
              {s.tituloDosItens ? (
                <h3 className="ab-subtitulo text-xl">{s.tituloDosItens}</h3>
              ) : (
                <span />
              )}
              {precoUnico !== null ? (
                <p className="ab-serif whitespace-nowrap text-lg uppercase text-[var(--ab-titulo)]">
                  Valor: {preco(precoUnico, cfg)}
                </p>
              ) : null}
            </div>
          ) : null}

          {s.layout === 'GALLERY' ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5">
              {s.itens.map((i) => (
                <li key={i.id}>
                  <CartaoGaleria i={i} cfg={cfg} promocoes={promocoes} hoje={hoje} qtd={qtd[i.id] ?? 0} mudar={mudar} whatsapp={whatsapp} />
                </li>
              ))}
            </ul>
          ) : s.layout === 'CARDS' ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-10">
              {s.itens.map((i, n) => (
                <li
                  key={i.id}
                  className={
                    n % 2 === 1 ? 'border-l-2 border-[var(--ab-linha)] pl-4 sm:pl-10' : undefined
                  }
                >
                  <Cartao
                    i={i}
                    cfg={cfg}
                    promocoes={promocoes}
                    hoje={hoje}
                    qtd={qtd[i.id] ?? 0}
                    mudar={mudar}
                    whatsapp={whatsapp}
                    reservarFoto={s.itens.some((x) => x.foto)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-6">
              {s.itens.map((i) => (
                <li key={i.id}>
                  <Linha
                    i={i}
                    cfg={cfg}
                    promocoes={promocoes}
                    hoje={hoje}
                    mostrarPreco={precoUnico === null}
                    qtd={qtd[i.id] ?? 0}
                    mudar={mudar}
                    whatsapp={whatsapp}
                  />
                </li>
              ))}
            </ul>
          )}

          <TextoCardapio texto={s.rodape} className="text-xs text-[var(--ab-texto-suave)]" />
        </div>
      ) : null}

      {s.destaque ? <p className="ab-faixa ab-serif text-sm sm:text-base">{s.destaque}</p> : null}

      <TextoCardapio texto={s.corpo} />
    </section>
  );
}

interface PropsItem {
  i: ItemPublico;
  cfg: CurrencyConfig;
  promocoes: PromocaoInput[];
  hoje: string;
  qtd: number;
  mudar: ((id: string, d: number) => void) | null;
  whatsapp: string | null;
}

/** Preco, preco riscado e etiquetas de promocao de um item. */
function PrecoDoItem({ i, cfg, promocoes, hoje, grande }: Omit<PropsItem, 'qtd' | 'mudar' | 'whatsapp'> & { grande?: boolean }) {
  if (i.sobConsulta) {
    return <p className="text-sm font-semibold uppercase text-[var(--ab-titulo)]">Sob consulta</p>;
  }
  const riscado = precoRiscado(i.id, i.preco, promocoes, hoje);
  const etiquetas = promocoesDeQuantidade(i.id, promocoes, hoje);
  return (
    <div className="space-y-1">
      <p className={grande ? 'ab-serif text-4xl text-[var(--ab-preco)]' : 'ab-serif text-lg text-[var(--ab-titulo)]'}>
        {riscado ? (
          <>
            <span className="mr-2 text-[0.7em] font-normal text-[var(--ab-texto-suave)] line-through">
              {preco(i.preco, cfg)}
            </span>
            {preco(riscado.unitPrice, cfg)}
          </>
        ) : (
          preco(i.preco, cfg)
        )}
      </p>
      <Etiquetas promos={[...(riscado ? [riscado.promo] : []), ...etiquetas]} cfg={cfg} />
    </div>
  );
}

function Etiquetas({ promos, cfg }: { promos: PromocaoInput[]; cfg: CurrencyConfig }) {
  if (promos.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {promos.map((p) => (
        <li
          key={p.id}
          className="rounded-full bg-[var(--ab-etiqueta)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ab-etiqueta-texto)]"
          title={p.name}
        >
          {descreverPromocao(p, cfg)}
        </li>
      ))}
    </ul>
  );
}

function Quantidade({ i, qtd, mudar, whatsapp }: Pick<PropsItem, 'i' | 'qtd' | 'mudar' | 'whatsapp'>) {
  const origem = use(Origem);
  if (i.esgotado) {
    return <span className="text-xs font-semibold uppercase text-[var(--ab-texto-suave)]">Esgotado</span>;
  }
  if (i.sobConsulta) {
    return whatsapp ? (
      <a
        href={linkWhatsApp(whatsapp, `Olá! Gostava de pedir um orçamento para: ${i.nome}.`)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => contarClique('QUOTE', origem)}
        className="text-xs font-semibold text-[var(--ab-titulo)] underline underline-offset-2"
      >
        Pedir orçamento
      </a>
    ) : null;
  }
  if (!mudar) return null;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${i.nome}`}>
      {qtd > 0 ? (
        <>
          <button type="button" className="ab-mais" onClick={() => mudar(i.id, -1)} aria-label={`Menos ${i.nome}`}>
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
            {qtd}
          </span>
        </>
      ) : null}
      <button
        type="button"
        className="ab-mais"
        data-cheio={qtd > 0}
        onClick={() => mudar(i.id, 1)}
        aria-label={`Juntar ${i.nome}`}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function Alergenios({ i }: { i: ItemPublico }) {
  const { presentes, completo } = i.alergenios;
  return (
    <details className="text-xs text-[var(--ab-texto-suave)]">
      <summary className="underline decoration-dotted underline-offset-2">Alergénios</summary>
      <p className="mt-1">
        {presentes.length ? `Contém: ${presentes.join(', ')}.` : completo ? 'Sem alergénios declarados.' : null}
        {completo ? null : ' Informação ainda incompleta — pergunte-nos antes de encomendar.'}
      </p>
    </details>
  );
}

function Linha({ i, cfg, promocoes, hoje, qtd, mudar, whatsapp, mostrarPreco }: PropsItem & { mostrarPreco: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${i.esgotado ? 'opacity-60' : ''}`}>
      {i.fotoMini ? (
        <div className="self-start">
          <Foto
            mini={i.fotoMini}
            grande={i.foto}
            alt={i.nome}
            className="h-24 w-24 rounded-2xl object-cover shadow-sm sm:h-28 sm:w-28"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <h4 className="flex items-baseline gap-3 text-2xl">
          {i.fotoMini ? null : <span className="ab-ponto translate-y-[-0.15em]" aria-hidden />}
          <span className="ab-serif">{i.nome}</span>
        </h4>
        {i.descricao ? <p className="leading-snug">{i.descricao}</p> : null}
        {i.leva.length ? <p className="text-sm text-[var(--ab-texto-suave)]">Leva {i.leva.join(', ')}.</p> : null}
        {i.unidade ? <p className="text-sm text-[var(--ab-texto-suave)]">{i.unidade}</p> : null}
        {mostrarPreco ? (
          <PrecoDoItem i={i} cfg={cfg} promocoes={promocoes} hoje={hoje} />
        ) : (
          // O preco esta no titulo da secao ("Valor: 25 €"); aqui so as
          // promocoes de quantidade, se houver.
          <Etiquetas promos={promocoesDeQuantidade(i.id, promocoes, hoje)} cfg={cfg} />
        )}
        <Alergenios i={i} />
      </div>
      <div className="shrink-0">
        <Quantidade i={i} qtd={qtd} mudar={mudar} whatsapp={whatsapp} />
      </div>
    </div>
  );
}

function Cartao({ i, cfg, promocoes, hoje, qtd, mudar, whatsapp, reservarFoto }: PropsItem & { reservarFoto: boolean }) {
  return (
    <div className={`flex h-full flex-col items-center gap-3 text-center ${i.esgotado ? 'opacity-60' : ''}`}>
      {i.foto ? (
        <Foto
          mini={i.fotoMini ?? i.foto}
          grande={i.foto}
          alt={i.nome}
          className="aspect-square w-full max-w-40 rounded-3xl object-cover shadow-sm"
        />
      ) : reservarFoto ? (
        // Outro cartao da secao tem foto: um quadrado liso no lugar, para os
        // tamanhos ficarem alinhados.
        <div aria-hidden className="aspect-square w-full max-w-40 rounded-3xl bg-[var(--ab-cartao)]" />
      ) : null}
      <h4 className="ab-cartao-tamanho w-full px-3 py-2 text-xl sm:text-2xl">{i.nome}</h4>
      {i.unidade ? <p className="text-lg">{i.unidade}</p> : null}
      {i.descricao ? <p className="text-sm leading-snug text-[var(--ab-texto-suave)]">{i.descricao}</p> : null}
      {i.leva.length ? <p className="text-xs text-[var(--ab-texto-suave)]">Leva {i.leva.join(', ')}.</p> : null}
      <PrecoDoItem i={i} cfg={cfg} promocoes={promocoes} hoje={hoje} grande />
      <div className="mt-auto flex flex-col items-center gap-2">
        <Quantidade i={i} qtd={qtd} mudar={mudar} whatsapp={whatsapp} />
        <Alergenios i={i} />
      </div>
    </div>
  );
}

/** Galeria: foto grande em cima, nome, preco e o "+" por baixo. */
function CartaoGaleria({ i, cfg, promocoes, hoje, qtd, mudar, whatsapp }: PropsItem) {
  return (
    <div className={`flex h-full flex-col gap-2 ${i.esgotado ? 'opacity-60' : ''}`}>
      {i.fotoMini ? (
        <Foto
          mini={i.fotoMini}
          grande={i.foto}
          alt={i.nome}
          className="aspect-square w-full rounded-2xl object-cover shadow-sm"
        />
      ) : (
        // Sem foto, um quadrado com a inicial: a grelha fica alinhada.
        <div
          aria-hidden
          className="ab-serif flex aspect-square w-full items-center justify-center rounded-2xl bg-[var(--ab-cartao)] text-5xl text-[var(--ab-rosa)]"
        >
          {i.nome.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <h4 className="ab-serif text-xl leading-tight">{i.nome}</h4>
      {i.descricao ? <p className="line-clamp-3 text-sm leading-snug text-[var(--ab-texto-suave)]">{i.descricao}</p> : null}
      {i.leva.length ? <p className="text-xs text-[var(--ab-texto-suave)]">Leva {i.leva.join(', ')}.</p> : null}
      {i.unidade ? <p className="text-xs text-[var(--ab-texto-suave)]">{i.unidade}</p> : null}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <PrecoDoItem i={i} cfg={cfg} promocoes={promocoes} hoje={hoje} />
        <Quantidade i={i} qtd={qtd} mudar={mudar} whatsapp={whatsapp} />
      </div>
      <Alergenios i={i} />
    </div>
  );
}
