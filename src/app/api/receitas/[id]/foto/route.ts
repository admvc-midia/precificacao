/**
 * A foto de uma receita do livro: `/api/receitas/<id>/foto` (a grande) ou
 * `?tam=mini`. Qualquer conta com sessao a ve — o livro e de todas.
 *
 * Mesmas regras da foto das fichas (`api/fotos/[id]`): o Blob e privado, a
 * sessao confirma-se na base, e o `?v=` muda a cada foto nova, por isso o
 * browser a pode guardar para sempre.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { lerFoto } from '@/lib/fotos';
import { utilizadorAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await utilizadorAtual())) return new NextResponse('Sessao em falta.', { status: 401 });

  const { id } = await params;
  const mini = new URL(req.url).searchParams.get('tam') === 'mini';
  const r = await prisma.bookRecipe.findUnique({
    where: { id },
    select: { photoPath: true, photoThumbPath: true },
  });
  const caminho = mini ? (r?.photoThumbPath ?? r?.photoPath) : r?.photoPath;
  if (!caminho) return new NextResponse('Sem foto.', { status: 404 });

  const foto = await lerFoto(caminho);
  if (!foto) return new NextResponse('Foto nao encontrada no armazenamento.', { status: 404 });

  return new NextResponse(foto.stream, {
    headers: {
      'Content-Type': foto.blob.contentType,
      'Content-Length': String(foto.blob.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
