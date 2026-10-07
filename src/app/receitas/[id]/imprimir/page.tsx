/**
 * Uma receita no papel. Para PDF, "Guardar como PDF" no dialogo de impressao —
 * a mesma escolha da ficha impressa (ver `fichas/[id]/imprimir`).
 */

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ReceitaImpressa } from '@/components/livro/receita-impressa';
import { PrintButton } from '@/components/print-button';
import { detalheReceita } from '@/lib/livro/consultas';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function ImprimirReceitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  await exigirSessao();
  const { id } = await params;
  const { v } = await searchParams;
  const r = await detalheReceita(id);
  if (!r) notFound();
  const versao =
    r.versions.find((x) => x.number === Number(v)) ??
    r.versions.find((x) => x.number === r.currentVersion) ??
    r.versions[0];

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        <Link href={`/receitas/${id}`} className="text-sm text-muted-foreground hover:underline">
          Voltar à receita
        </Link>
        <span className="text-xs text-muted-foreground">
          Para PDF, escolha &quot;Guardar como PDF&quot; no diálogo de impressão.
        </span>
      </div>
      {/* Imagem e nao fundo: o "sem graficos de fundo" da impressao apagava-o. */}
      <Image src="/logo-vinho.png" alt="Amo Brigs" width={1200} height={342} priority className="mb-4 h-10 w-auto dark:hidden print:block!" />
      <ReceitaImpressa receita={r} versao={versao} />
    </div>
  );
}
