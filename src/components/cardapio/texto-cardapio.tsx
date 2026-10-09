/**
 * Os textos do cardapio (descricao, corpo, notas) com a identidade do site.
 *
 * Recebe o texto cru e desenha os blocos de `lerTexto`: nunca HTML vindo da
 * base. Sem estado, por isso serve tanto a pagina como os componentes de
 * cliente do cardapio.
 *
 * `fechado`: cada subtitulo (`##` ou `###`) vira uma secao que se abre
 * (`<details>`), com o resumo no titulo ("Recheios · 18 opcoes"). O que vem
 * antes do primeiro subtitulo fica a vista. No telemovel, 2 000 caracteres de
 * texto aberto cansam; fechados, le-se o que interessa.
 *
 * Um destaque com " | " (a lista dos recheios) desenha-se como etiquetas.
 */

import { ChevronDown } from 'lucide-react';

import { lerTexto, type Bloco, type Trecho } from '@/lib/cardapio/texto';
import { cn } from '@/lib/utils';

function Linha({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) =>
        t.negrito ? (
          <strong key={i} className="font-bold">
            {t.texto}
          </strong>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

/** "Chocolate | Coco | Nozes" → ["Chocolate", "Coco", "Nozes"]; senao nulo. */
export function etiquetasDe(trechos: Trecho[]): string[] | null {
  const texto = trechos.map((t) => t.texto).join('');
  if (!texto.includes('|')) return null;
  const partes = texto
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length >= 3 ? partes : null;
}

function Desenho({ b }: { b: Bloco }) {
  switch (b.tipo) {
    case 'subtitulo':
      return (
        <h3 className="pt-2 text-xl">
          <span className="ab-subtitulo">{b.texto}</span>
          {b.aparte ? (
            <span className="ml-3 align-middle text-sm font-normal text-[var(--ab-texto-suave)]">{b.aparte}</span>
          ) : null}
        </h3>
      );
    case 'pilula':
      return (
        <h3 className="pt-2">
          <span className="ab-pilula ab-serif text-2xl">{b.texto}</span>
        </h3>
      );
    case 'lista': {
      // Como no PDF: itens curtos ("Baunilha") em maiusculas; frases em texto normal.
      const curta = b.itens.every((it) => it.map((t) => t.texto).join('').length <= 40);
      return (
        <ul className={curta ? 'space-y-2' : 'space-y-4'}>
          {b.itens.map((item, j) => (
            <li key={j} className="flex items-baseline gap-3">
              <span className="ab-ponto translate-y-[-0.1em]" aria-hidden />
              <span className={curta ? 'ab-serif text-lg uppercase tracking-wide' : 'ab-justificado leading-relaxed'}>
                <Linha trechos={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    }
    case 'destaque': {
      const etiquetas = etiquetasDe(b.trechos);
      if (etiquetas) {
        return (
          <ul className="flex flex-wrap gap-2">
            {etiquetas.map((e) => (
              <li key={e} className="ab-etiqueta-opcao">
                {e}
              </li>
            ))}
          </ul>
        );
      }
      return (
        <p className="ab-serif text-lg leading-relaxed text-[var(--ab-titulo)]">
          <Linha trechos={b.trechos} />
        </p>
      );
    }
    case 'nota':
      return (
        <p className="text-xs text-[var(--ab-texto-suave)]">
          <Linha trechos={b.trechos} />
        </p>
      );
    case 'paragrafo':
      return (
        <p className="ab-justificado leading-relaxed">
          <Linha trechos={b.trechos} />
        </p>
      );
  }
}

/** Quantas opcoes tem um grupo ("18 opcoes"), para o resumo do titulo. */
export function resumoDoGrupo(blocos: Bloco[]): string | null {
  for (const b of blocos) {
    if (b.tipo === 'destaque') {
      const e = etiquetasDe(b.trechos);
      if (e) return `${e.length} opções`;
    }
    if (b.tipo === 'lista' && b.itens.length > 1) return `${b.itens.length} opções`;
  }
  return null;
}

/** Parte os blocos em: o que fica a vista, e um grupo por subtitulo. */
export function agrupar(blocos: Bloco[]): { antes: Bloco[]; grupos: Array<{ titulo: string; aparte: string | null; blocos: Bloco[] }> } {
  const antes: Bloco[] = [];
  const grupos: Array<{ titulo: string; aparte: string | null; blocos: Bloco[] }> = [];
  for (const b of blocos) {
    if (b.tipo === 'subtitulo' || b.tipo === 'pilula') {
      grupos.push({ titulo: b.texto, aparte: b.tipo === 'subtitulo' ? b.aparte : null, blocos: [] });
    } else if (grupos.length) {
      grupos[grupos.length - 1].blocos.push(b);
    } else {
      antes.push(b);
    }
  }
  return { antes, grupos };
}

export function TextoCardapio({
  texto,
  className,
  fechado = false,
}: {
  texto: string | null | undefined;
  className?: string;
  fechado?: boolean;
}) {
  const blocos = lerTexto(texto);
  if (blocos.length === 0) return null;

  if (!fechado) {
    return (
      <div className={cn('space-y-4', className)}>
        {blocos.map((b, i) => (
          <Desenho key={i} b={b} />
        ))}
      </div>
    );
  }

  const { antes, grupos } = agrupar(blocos);
  return (
    <div className={cn('space-y-3', className)}>
      {antes.map((b, i) => (
        <Desenho key={`a${i}`} b={b} />
      ))}
      {grupos.map((g, i) => {
        const resumo = resumoDoGrupo(g.blocos);
        return (
          <details key={i} className="ab-acordeao">
            <summary className="flex items-center justify-between gap-3">
              <span className="ab-serif text-xl text-[var(--ab-titulo)]">
                {g.titulo}
                {resumo || g.aparte ? (
                  <span className="ml-2 font-sans text-sm font-normal text-[var(--ab-texto-suave)]">
                    · {resumo ?? g.aparte}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="ab-acordeao-seta h-5 w-5 shrink-0 text-[var(--ab-texto-suave)]" aria-hidden />
            </summary>
            <div className="space-y-3 pb-4 pt-1">
              {g.aparte && resumo ? <p className="text-sm text-[var(--ab-texto-suave)]">{g.aparte}</p> : null}
              {g.blocos.map((b, j) => (
                <Desenho key={j} b={b} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
