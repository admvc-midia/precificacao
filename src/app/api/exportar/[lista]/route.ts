/**
 * Descarrega uma lista em CSV (`/api/exportar/insumos`) ou tudo em JSON
 * (`/api/exportar/copia`).
 *
 * O `proxy.ts` ja barra quem nao entrou. A sessao volta a ser conferida aqui
 * porque isto entrega a base inteira de uma vez: se um dia o matcher do proxy
 * mudar e deixar esta rota de fora, ela continua fechada.
 */

import { NextResponse } from 'next/server';

import { utilizadorAtual } from '@/lib/sessao';
import { copiaCompleta, copiaEmJson, gerarLista } from '@/lib/exportar/gerar';
import { eLista, nomeDoFicheiro } from '@/lib/exportar/listas';

export const dynamic = 'force-dynamic';

function ficheiro(conteudo: string, nome: string, tipo: string) {
  return new NextResponse(conteudo, {
    headers: {
      'Content-Type': `${tipo}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ lista: string }> }) {
  // O proxy ja so deixa passar o dono; aqui confirma-se na base que a conta continua igual.
  const eu = await utilizadorAtual();
  if (eu?.perfil !== 'OWNER') {
    return new NextResponse('Sem permissao.', { status: 403 });
  }

  const { lista } = await params;

  if (lista === 'copia') {
    const json = copiaEmJson(await copiaCompleta());
    return ficheiro(json, nomeDoFicheiro('copia-completa', 'json'), 'application/json');
  }

  if (!eLista(lista)) {
    return new NextResponse('Lista desconhecida.', { status: 404 });
  }

  const csv = await gerarLista(lista);
  return ficheiro(csv, nomeDoFicheiro(lista, 'csv'), 'text/csv');
}
