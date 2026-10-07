/**
 * O livro no papel: capa, indice, e uma receita por folha.
 *
 * `?versao=original` imprime cada receita como veio da fonte; sem isso, vai a
 * versao em uso (a da cozinha). Para PDF, "Guardar como PDF" no dialogo de
 * impressao — sem biblioteca de PDF, pela mesma razao da ficha impressa.
 */

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ReceitaImpressa } from '@/components/livro/receita-impressa';
import { PrintButton } from '@/components/print-button';
import { detalheLivro, porSeccao } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const dataFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' });

export default async function ImprimirLivroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ versao?: string }>;
}) {
  await exigirSessao();
  const { id } = await params;
  const { versao } = await searchParams;
  const livro = await detalheLivro(id);
  if (!livro) notFound();
  const originais = versao === 'original';
  const seccoes = porSeccao(livro.entries);
  // O numero de cada receita, pela ordem em que sai no papel. O Chrome nao
  // calcula numeros de pagina para um indice (nao suporta `target-counter`),
  // por isso o indice aponta para o numero da receita, que vai no topo dela.
  const numeros = new Map(seccoes.flatMap(({ itens }) => itens).map((e, i) => [e.id, i + 1]));

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        <Link href={`/livros/${id}`} className="text-sm text-muted-foreground hover:underline">
          Voltar ao livro
        </Link>
        <Link
          href={originais ? `/livros/${id}/imprimir` : `/livros/${id}/imprimir?versao=original`}
          className="text-sm text-primary hover:underline"
        >
          {originais ? 'Imprimir com as versões da cozinha' : 'Imprimir com as receitas originais'}
        </Link>
        <span className="text-xs text-muted-foreground">
          Para PDF, escolha &quot;Guardar como PDF&quot; no diálogo de impressão.
        </span>
      </div>

      {/* ------------------------------------------------ capa */}
      <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center print:min-h-[240mm]">
        <Image src="/logo-vinho.png" alt="Amo Brigs" width={1200} height={342} priority className="h-20 w-auto dark:hidden print:block!" />
        <h1 className="font-titulo text-5xl font-semibold leading-tight">{livro.title}</h1>
        {livro.subtitle ? <p className="text-lg text-muted-foreground">{livro.subtitle}</p> : null}
        {livro.description ? (
          <p className="max-w-lg whitespace-pre-line text-sm leading-relaxed">{livro.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {dataFmt.format(new Date())}
          {originais ? ' · receitas originais' : ''}
        </p>
      </section>

      {/* ------------------------------------------------ indice */}
      <section className="folha-nova mt-12 space-y-4 print:mt-0">
        <h2 className="font-titulo text-3xl font-semibold">Índice</h2>
        {seccoes.map(({ seccao, itens }) => (
          <div key={seccao ?? '-'} className="break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {seccao ?? 'Outras'}
            </h3>
            <ol className="space-y-1 text-sm">
              {itens.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2">
                  <span>{e.recipe.title}</span>
                  {/* Os pontos ate ao numero, como num livro. */}
                  <span aria-hidden className="flex-1 border-b border-dotted border-muted-foreground/50" />
                  <span className="tabular-nums text-muted-foreground">{numeros.get(e.id)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------ receitas */}
      {seccoes.flatMap(({ itens }) =>
        itens.map((e) => (
          <ReceitaImpressa
            key={e.id}
            receita={e.recipe}
            versao={originais ? e.original : e.atual}
            numero={numeros.get(e.id)}
            className="folha-nova mt-16 print:mt-0"
          />
        )),
      )}
    </div>
  );
}
