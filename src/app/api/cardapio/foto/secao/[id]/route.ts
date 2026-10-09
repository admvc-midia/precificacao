/**
 * A foto de capa de uma secao do cardapio publico:
 * `/api/cardapio/foto/secao/<secaoId>` (a grande) ou `?tam=mini`.
 *
 * Como a das fotos dos itens (`../../[id]/route.ts`): aberta sem sessao, mas
 * so para uma secao publicada num cardapio ligado; cache publica e imutavel
 * porque o `?v=` muda a cada foto nova.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { lerFoto } from '@/lib/fotos';
import { utilizadorAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mini = new URL(req.url).searchParams.get('tam') === 'mini';

  const [settings, secao] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 'default' }, select: { menuPublished: true } }),
    prisma.menuSection.findUnique({
      where: { id },
      select: { published: true, photoPath: true, photoThumbPath: true },
    }),
  ]);
  const visivel = settings?.menuPublished && secao?.published;
  // O dono ve as fotos das secoes escondidas, no ecra do cardapio.
  const doDono = !visivel && (await utilizadorAtual())?.perfil === 'OWNER';
  if (!secao || (!visivel && !doDono)) return new NextResponse('Sem foto.', { status: 404 });

  const caminho = mini ? (secao.photoThumbPath ?? secao.photoPath) : secao.photoPath;
  if (!caminho) return new NextResponse('Sem foto.', { status: 404 });

  const blob = await lerFoto(caminho);
  if (!blob) return new NextResponse('Foto nao encontrada no armazenamento.', { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType,
      'Content-Length': String(blob.blob.size),
      // A de um rascunho so o dono a ve: nenhuma cache partilhada a guarda.
      'Cache-Control': `${doDono ? 'private' : 'public'}, max-age=31536000, immutable`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
