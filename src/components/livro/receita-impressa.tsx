/**
 * Uma receita no papel: titulo, origem, rendimento e tempo, ingredientes ao
 * lado do preparo, notas. Serve a impressao de uma receita e a do livro.
 *
 * Sem custos e sem ficha tecnica: o papel e lido por quem passa na cozinha.
 */

import { Ingredientes, Passos } from '@/components/livro/receita-texto';
import { fotoReceitaSrc } from '@/lib/foto-url';
import { SOURCE_KIND_LABEL, type SourceKind } from '@/lib/livro/receita';
import { cn } from '@/lib/utils';

const dataFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeZone: 'Europe/Lisbon' });

export function ReceitaImpressa({
  receita,
  versao,
  numero,
  className,
}: {
  /** O numero da receita no livro, o mesmo do indice. */
  numero?: number;
  receita: {
    id: string;
    title: string;
    sourceKind: SourceKind | null;
    sourceName: string | null;
    photoPath: string | null;
  };
  versao: {
    number: number;
    ingredients: string;
    steps: string;
    yield: string | null;
    prepTime: string | null;
    notes: string | null;
    createdAt: Date;
    authorName: string;
  };
  className?: string;
}) {
  const origem = [receita.sourceKind ? SOURCE_KIND_LABEL[receita.sourceKind] : null, receita.sourceName]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={cn('space-y-5', className)}>
      <header className="border-b pb-3">
        {numero ? (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Receita {numero}
          </p>
        ) : null}
        <h2 className="font-titulo text-3xl font-semibold leading-tight">{receita.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {origem ? `${origem} · ` : ''}
          {versao.number === 1
            ? 'versão original'
            : `versão ${versao.number}, de ${dataFmt.format(versao.createdAt)} (${versao.authorName})`}
        </p>
        {versao.yield || versao.prepTime ? (
          <p className="mt-2 flex flex-wrap gap-x-6 text-sm">
            {versao.yield ? (
              <span>
                <span className="text-muted-foreground">Rendimento: </span>
                <strong>{versao.yield}</strong>
              </span>
            ) : null}
            {versao.prepTime ? (
              <span>
                <span className="text-muted-foreground">Tempo: </span>
                <strong>{versao.prepTime}</strong>
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      {receita.photoPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- rota com sessao; o otimizador do next/image pede-a sem cookie
        <img
          src={fotoReceitaSrc(receita.id, receita.photoPath)!}
          alt={receita.title}
          className="max-h-[80mm] w-full break-inside-avoid rounded-md object-cover"
        />
      ) : null}

      <div className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:grid-cols-[2fr_3fr]">
        <section className="break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ingredientes
          </h3>
          <Ingredientes texto={versao.ingredients} className="text-sm" />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Modo de preparo
          </h3>
          <Passos texto={versao.steps} className="text-sm leading-relaxed" />
        </section>
      </div>

      {versao.notes ? (
        <section className="break-inside-avoid rounded-md border p-3 text-sm">
          <h3 className="mb-1 font-semibold">Notas e dicas</h3>
          <p className="whitespace-pre-line">{versao.notes}</p>
        </section>
      ) : null}
    </article>
  );
}
