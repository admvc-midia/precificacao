/**
 * A foto de uma ficha: `/api/fotos/<id>` (a grande) ou `?tam=mini`.
 *
 * O store do Blob e privado, por isso a foto passa por aqui: a app le-a com o
 * token e entrega-a a quem tem sessao. O `proxy.ts` ja barra quem nao entrou;
 * a sessao volta a ser conferida aqui pela mesma razao da exportacao — se o
 * matcher mudar um dia, isto continua fechado.
 *
 * Cache: o endereco leva `?v=` com o caminho da foto, que muda a cada foto
 * nova. O browser pode guarda-la para sempre (`immutable`) sem nunca mostrar
 * uma antiga. `private` porque e conteudo de quem tem sessao — nenhuma cache
 * partilhada pelo caminho a deve guardar.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { COOKIE, sessaoValida } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { lerFoto } from '@/lib/fotos';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!sessaoValida(jar.get(COOKIE)?.value)) {
    return new NextResponse('Sessao em falta.', { status: 401 });
  }

  const { id } = await params;
  const mini = new URL(req.url).searchParams.get('tam') === 'mini';
  const ficha = await prisma.recipe.findUnique({
    where: { id },
    select: { photoPath: true, photoThumbPath: true },
  });
  const caminho = mini ? (ficha?.photoThumbPath ?? ficha?.photoPath) : ficha?.photoPath;
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
