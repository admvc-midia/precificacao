'use client';

/**
 * Os produtos na lista do cardapio: leves (foto, nome, uma linha, preco e o
 * "+"). Tocar no produto abre a folha com tudo (`FolhaProduto`); o "+" junta
 * logo, sem abrir.
 */

import { Minus, Plus } from 'lucide-react';

import type { ItemPublico } from '@/lib/cardapio/consultas';
import { descreverPromocao, precoRiscado, promocoesDeQuantidade, type PromocaoInput } from '@/lib/pricing/cardapio';
import { linkWhatsApp } from '@/lib/pricing/clientes';
import { cn } from '@/lib/utils';
import { contarEvento, DESTAQUE_LABEL, preco, useCardapio, vibrar } from './contexto';

export function Etiquetas({ promos }: { promos: PromocaoInput[] }) {
  const { cfg } = useCardapio();
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

/** Preco, preco riscado e etiquetas de promocao. */
export function PrecoDoItem({ i, tamanho = 'normal' }: { i: ItemPublico; tamanho?: 'pequeno' | 'normal' | 'grande' }) {
  const { cfg, dados, hoje } = useCardapio();
  if (i.sobConsulta) {
    return <p className="text-sm font-semibold uppercase text-[var(--ab-titulo)]">Sob consulta</p>;
  }
  const riscado = precoRiscado(i.id, i.preco, dados.promocoes, hoje);
  const etiquetas = promocoesDeQuantidade(i.id, dados.promocoes, hoje);
  const classe =
    tamanho === 'grande' ? 'ab-serif text-3xl text-[var(--ab-preco)]' : tamanho === 'pequeno' ? 'ab-serif text-base text-[var(--ab-titulo)]' : 'ab-serif text-lg text-[var(--ab-titulo)]';
  return (
    <div className="space-y-1">
      <p className={classe}>
        {riscado ? (
          <>
            <span className="mr-1.5 text-[0.75em] font-normal text-[var(--ab-texto-suave)] line-through">{preco(i.preco, cfg)}</span>
            {preco(riscado.unitPrice, cfg)}
          </>
        ) : (
          preco(i.preco, cfg)
        )}
      </p>
      <Etiquetas promos={[...(riscado ? [riscado.promo] : []), ...etiquetas]} />
    </div>
  );
}

/** O "+" (e o "−" quando ja ha), ou "Esgotado", ou "Pedir orcamento". */
export function Quantidade({ i, grande = false }: { i: ItemPublico; grande?: boolean }) {
  const { qtd, mudar, dados, origem } = useCardapio();
  const q = qtd[i.id] ?? 0;
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();
  if (i.esgotado) {
    return <span className="text-xs font-semibold uppercase text-[var(--ab-texto-suave)]">Esgotado</span>;
  }
  if (i.sobConsulta) {
    return dados.whatsapp ? (
      <a
        href={linkWhatsApp(dados.whatsapp, `Olá! Gostava de pedir um orçamento para: ${i.nome}.`)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          parar(e);
          contarEvento('QUOTE', origem, i.id);
        }}
        className="text-xs font-semibold text-[var(--ab-titulo)] underline underline-offset-2"
      >
        Pedir orçamento
      </a>
    ) : null;
  }
  if (!mudar) return null;
  const juntar = (e: React.SyntheticEvent) => {
    parar(e);
    mudar(i.id, 1);
    vibrar();
    contarEvento('ADD', origem, i.id);
  };
  const tamanho = grande ? 'h-11 w-11' : '';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${i.nome}`} onClick={parar}>
      {q > 0 ? (
        <>
          <button type="button" className={cn('ab-mais', tamanho)} onClick={() => mudar(i.id, -1)} aria-label={`Menos ${i.nome}`}>
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
            {q}
          </span>
        </>
      ) : null}
      <button type="button" className={cn('ab-mais', tamanho)} data-cheio={q > 0} onClick={juntar} aria-label={`Juntar ${i.nome}`}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** A miniatura (com fundo da marca ate carregar), ou a inicial. */
export function Miniatura({ i, className }: { i: ItemPublico; className?: string }) {
  return i.fotoMini ? (
    // eslint-disable-next-line @next/next/no-img-element -- rota propria, sem otimizador
    <img src={i.fotoMini} alt="" loading="lazy" decoding="async" className={cn('ab-foto object-cover', className)} />
  ) : (
    <span aria-hidden className={cn('ab-serif flex items-center justify-center bg-[var(--ab-cartao)] text-[var(--ab-rosa)]', className)}>
      {i.nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function SeloDestaque({ i, className }: { i: ItemPublico; className?: string }) {
  if (!i.destaque) return null;
  return (
    <span className={cn('ab-selo', i.destaque === 'NEW' && 'ab-selo-novo', className)}>{DESTAQUE_LABEL[i.destaque]}</span>
  );
}

/** Uma linha da Lista: foto, nome, uma linha de descricao, preco, "+". */
export function ItemLinha({ i, mostrarPreco = true }: { i: ItemPublico; mostrarPreco?: boolean }) {
  const { abrirProduto, dados, hoje } = useCardapio();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => abrirProduto(i.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), abrirProduto(i.id))}
      className={cn('ab-revelar ab-toque flex items-center gap-3 rounded-2xl p-2', i.esgotado && 'opacity-60')}
    >
      <Miniatura i={i} className="h-20 w-20 shrink-0 rounded-2xl text-3xl" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="ab-serif text-xl leading-tight">{i.nome}</h4>
          <SeloDestaque i={i} />
        </div>
        {i.descricao ? <p className="line-clamp-1 text-sm text-[var(--ab-texto-suave)]">{i.descricao}</p> : null}
        <div className="mt-1">
          {mostrarPreco ? <PrecoDoItem i={i} tamanho="pequeno" /> : <Etiquetas promos={promocoesDeQuantidade(i.id, dados.promocoes, hoje)} />}
        </div>
      </div>
      <Quantidade i={i} />
    </div>
  );
}

/** Um cartao de tamanho (16 cm / 20 cm), dois por linha. */
export function ItemCartao({ i, reservarFoto }: { i: ItemPublico; reservarFoto: boolean }) {
  const { abrirProduto } = useCardapio();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => abrirProduto(i.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), abrirProduto(i.id))}
      className={cn('ab-revelar ab-toque flex h-full flex-col items-center gap-2 rounded-3xl p-2 text-center', i.esgotado && 'opacity-60')}
    >
      {i.fotoMini || reservarFoto ? <Miniatura i={i} className="aspect-square w-full max-w-36 rounded-3xl text-5xl" /> : null}
      {/* Nomes curtos ("16 cm") em pilula; compridos, num cartao de cantos suaves. */}
      <h4
        className={cn(
          'ab-cartao-tamanho w-full px-3 py-1.5',
          i.nome.length > 14 ? 'ab-cartao-tamanho-longo text-base leading-snug' : 'text-xl',
        )}
      >
        {i.nome}
      </h4>
      <SeloDestaque i={i} />
      {i.unidade ? <p className="text-base">{i.unidade}</p> : null}
      <PrecoDoItem i={i} tamanho="grande" />
      <div className="mt-auto">
        <Quantidade i={i} />
      </div>
    </div>
  );
}

/** Galeria: foto grande, nome, preco e "+", dois por linha. */
export function ItemGaleria({ i }: { i: ItemPublico }) {
  const { abrirProduto } = useCardapio();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => abrirProduto(i.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), abrirProduto(i.id))}
      className={cn('ab-revelar ab-toque flex h-full flex-col gap-2 rounded-3xl p-1.5', i.esgotado && 'opacity-60')}
    >
      <div className="relative">
        <Miniatura i={i} className="aspect-square w-full rounded-2xl text-5xl" />
        <SeloDestaque i={i} className="absolute left-2 top-2" />
      </div>
      <h4 className="ab-serif text-lg leading-tight">{i.nome}</h4>
      {i.descricao ? <p className="line-clamp-2 text-xs text-[var(--ab-texto-suave)]">{i.descricao}</p> : null}
      <div className="mt-auto flex items-end justify-between gap-2">
        <PrecoDoItem i={i} tamanho="pequeno" />
        <Quantidade i={i} />
      </div>
    </div>
  );
}

/** O cartao da faixa de destaques, no topo. */
export function CartaoDestaque({ i }: { i: ItemPublico }) {
  const { abrirProduto } = useCardapio();
  return (
    <button
      type="button"
      onClick={() => abrirProduto(i.id)}
      className="ab-toque flex w-40 shrink-0 snap-start flex-col gap-1.5 rounded-3xl p-1.5 text-left"
    >
      <div className="relative">
        <Miniatura i={i} className="aspect-[4/5] w-full rounded-2xl text-5xl" />
        <SeloDestaque i={i} className="absolute left-2 top-2" />
      </div>
      <span className="ab-serif line-clamp-2 text-base leading-tight">{i.nome}</span>
      <PrecoDoItem i={i} tamanho="pequeno" />
    </button>
  );
}
