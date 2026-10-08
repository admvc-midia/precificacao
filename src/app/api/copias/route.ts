/**
 * Descarrega uma copia guardada pela app (`/api/copias?c=copias/....json`).
 *
 * O proxy so deixa passar o dono; volta a confirmar-se aqui, como em
 * `/api/exportar`, porque isto entrega a base inteira de uma vez.
 */

import { NextResponse } from 'next/server';

import { lerCopiaGuardada } from '@/lib/exportar/guardadas';
import { utilizadorAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const eu = await utilizadorAtual();
  if (eu?.perfil !== 'OWNER') return new NextResponse('Sem permissao.', { status: 403 });

  const caminho = new URL(req.url).searchParams.get('c') ?? '';
  const f = await lerCopiaGuardada(caminho);
  if (!f) return new NextResponse('Copia nao encontrada.', { status: 404 });

  const nome = caminho.slice(caminho.lastIndexOf('/') + 1);
  return new NextResponse(f.stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="precificacao-${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}
