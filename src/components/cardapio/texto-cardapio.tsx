/**
 * Os textos do cardapio (descricao, corpo, notas) com a identidade do menu.
 *
 * Recebe o texto cru e desenha os blocos de `lerTexto`: nunca HTML vindo da
 * base. Sem estado, por isso serve tanto a pagina como o componente de
 * cliente do cardapio.
 */

import { lerTexto, type Trecho } from '@/lib/cardapio/texto';
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

export function TextoCardapio({ texto, className }: { texto: string | null | undefined; className?: string }) {
  const blocos = lerTexto(texto);
  if (blocos.length === 0) return null;
  return (
    <div className={cn('space-y-4', className)}>
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case 'subtitulo':
            return (
              <h3 key={i} className="pt-2 text-xl">
                <span className="ab-subtitulo">{b.texto}</span>
                {b.aparte ? (
                  <span className="ml-3 align-middle text-sm font-normal text-[var(--ab-texto-suave)]">
                    {b.aparte}
                  </span>
                ) : null}
              </h3>
            );
          case 'pilula':
            return (
              <h3 key={i} className="pt-2">
                <span className="ab-pilula ab-serif text-2xl">{b.texto}</span>
              </h3>
            );
          case 'lista': {
            // Como no PDF: itens curtos ("Baunilha") em maiusculas com ponto
            // verde; frases ("Cuidados extras") em texto normal, ponto rosa.
            const curta = b.itens.every((it) => it.map((t) => t.texto).join('').length <= 40);
            return (
              <ul key={i} className={curta ? 'space-y-2' : 'space-y-4'}>
                {b.itens.map((item, j) => (
                  <li key={j} className="flex items-baseline gap-3">
                    <span
                      className="ab-ponto translate-y-[-0.1em]"
                      style={curta ? undefined : { background: 'var(--ab-rosa)' }}
                      aria-hidden
                    />
                    <span
                      className={
                        curta ? 'ab-serif text-lg uppercase tracking-wide' : 'ab-justificado leading-relaxed'
                      }
                    >
                      <Linha trechos={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          }
          case 'destaque':
            return (
              <p key={i} className="ab-serif text-lg leading-relaxed text-[var(--ab-titulo)]">
                <Linha trechos={b.trechos} />
              </p>
            );
          case 'nota':
            return (
              <p key={i} className="text-xs text-[var(--ab-texto-suave)]">
                <Linha trechos={b.trechos} />
              </p>
            );
          case 'paragrafo':
            return (
              <p key={i} className="ab-justificado leading-relaxed">
                <Linha trechos={b.trechos} />
              </p>
            );
        }
      })}
    </div>
  );
}
