/**
 * Um texto com a marcacao do cardapio (`lib/cardapio/texto.ts`), desenhado
 * com as cores da app (claro e escuro). O cardapio publico tem o seu proprio
 * (`TextoCardapio`), com a identidade do link.
 */

import { lerTexto, type Trecho } from '@/lib/cardapio/texto';
import { cn } from '@/lib/utils';

function Linha({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}
    </>
  );
}

export function TextoMarcado({ texto, className }: { texto: string | null | undefined; className?: string }) {
  const blocos = lerTexto(texto);
  if (blocos.length === 0) return null;
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed', className)}>
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case 'subtitulo':
            return (
              <h3 key={i} className="pt-1 text-xs font-semibold uppercase tracking-wide text-primary">
                {b.texto}
                {b.aparte ? <span className="ml-2 font-normal normal-case text-muted-foreground">{b.aparte}</span> : null}
              </h3>
            );
          case 'pilula':
            return (
              <h3 key={i} className="pt-1 font-semibold">
                {b.texto}
              </h3>
            );
          case 'lista':
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 marker:text-primary">
                {b.itens.map((item, j) => (
                  <li key={j}>
                    <Linha trechos={item} />
                  </li>
                ))}
              </ul>
            );
          case 'destaque':
            return (
              <p key={i} className="border-l-2 border-primary pl-3 font-medium">
                <Linha trechos={b.trechos} />
              </p>
            );
          case 'nota':
            return (
              <p key={i} className="text-xs text-muted-foreground">
                <Linha trechos={b.trechos} />
              </p>
            );
          case 'paragrafo':
            return (
              <p key={i}>
                <Linha trechos={b.trechos} />
              </p>
            );
        }
      })}
    </div>
  );
}
