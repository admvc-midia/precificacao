/**
 * O PDF de onde uma receita foi importada. Qualquer conta com sessao o pode
 * abrir — e a fonte da receita, que todas podem ler.
 *
 * O store do Blob e privado: o ficheiro passa por aqui, com a sessao
 * confirmada na base.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { lerOriginal } from '@/lib/livro/ficheiros';
import { utilizadorAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await utilizadorAtual())) return new NextResponse('Sessao em falta.', { status: 401 });

  const { id } = await params;
  const r = await prisma.bookRecipe.findUnique({
    where: { id },
    select: { sourceFilePath: true, sourceFileName: true },
  });
  if (!r?.sourceFilePath) return new NextResponse('Sem ficheiro original.', { status: 404 });

  const f = await lerOriginal(r.sourceFilePath);
  if (!f) return new NextResponse('Ficheiro nao encontrado no armazenamento.', { status: 404 });

  // So letras simples no nome do cabecalho; o nome original vai codificado ao lado.
  const nome = (r.sourceFileName ?? 'receita.pdf').replace(/[^\w.\- ]/g, '_');
  return new NextResponse(f.stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(f.blob.size),
      'Content-Disposition': `inline; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(r.sourceFileName ?? 'receita.pdf')}`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
