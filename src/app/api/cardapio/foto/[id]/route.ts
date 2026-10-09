/**
 * A foto de um item do cardapio publico: `/api/cardapio/foto/<itemId>` (a
 * grande) ou `?tam=mini`.
 *
 * Aberta sem sessao (`abertaSemSessao` em `lib/auth.ts`), mas so entrega a
 * foto de um item **publicado** num cardapio **ligado** (a propria, ou a da
 * ficha — ver `caminhoDaFoto`): a foto de uma ficha
 * que nao esta no cardapio continua so em `/api/fotos`, atras do login. O id
 * e o do item, nao o da ficha, para o link publico nao revelar ids de fichas.
 *
 * Cache: `public` (e o mesmo para toda a gente) e `immutable`, porque o
 * endereco leva `?v=` com o fim do caminho, que muda a cada foto nova.
 */

import { NextResponse } from 'next/server';

import { caminhoDaFoto } from '@/lib/cardapio/consultas';
import { prisma } from '@/lib/db';
import { lerFoto } from '@/lib/fotos';
import { utilizadorAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mini = new URL(req.url).searchParams.get('tam') === 'mini';

  const fotoSel = { select: { photoPath: true, photoThumbPath: true } } as const;
  const [settings, item] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 'default' }, select: { menuPublished: true } }),
    prisma.menuItem.findUnique({
      where: { id },
      select: {
        published: true,
        photoPath: true,
        photoThumbPath: true,
        section: { select: { published: true } },
        recipe: fotoSel,
        components: { select: { recipe: fotoSel }, orderBy: { id: 'asc' } },
      },
    }),
  ]);
  const visivel = settings?.menuPublished && item?.published && (item.section?.published ?? true);
  // O dono ve as fotos dos rascunhos, no ecra do cardapio.
  const doDono = !visivel && (await utilizadorAtual())?.perfil === 'OWNER';
  if (!item || (!visivel && !doDono)) return new NextResponse('Sem foto.', { status: 404 });

  const foto = caminhoDaFoto(item);
  const caminho = mini ? (foto?.photoThumbPath ?? foto?.photoPath) : foto?.photoPath;
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
