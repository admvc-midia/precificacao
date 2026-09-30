/**
 * Diagnostico: o que a aplicacao ve do sitio onde esta a correr.
 *
 * ---------------------------------------------------------------------------
 * PORQUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Quando um Server Component falha em producao, o React esconde a mensagem e
 * deixa so um numero. A verdadeira fica nos registos do servidor, que nem
 * sempre sao faceis de alcancar — e a diferenca entre "a porta do pooler esta
 * errada", "falta a variavel" e "o motor do Prisma nao carregou" e enorme para
 * quem tem de a corrigir.
 *
 * Esta rota tenta falar com o banco e **devolve o erro tal como e**, com o
 * codigo do Prisma. Uma pagina a dizer o que esta mal poupa uma ida aos
 * registos.
 *
 * ---------------------------------------------------------------------------
 * O QUE NAO SAI DAQUI
 * ---------------------------------------------------------------------------
 * Nunca a palavra-passe, nunca as credenciais do banco. Da ligacao sai o
 * anfitriao, a porta e os parametros — que e o que importa diagnosticar — com
 * o utilizador e a senha substituidos. E so se ve com sessao iniciada: o
 * `proxy.ts` cobre esta rota como cobre as paginas.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { protegida } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** A forma da ligacao, sem o que e segredo. */
function ligacao(): Record<string, unknown> {
  const bruto = process.env.DATABASE_URL;
  if (!bruto) return { definida: false };

  try {
    const u = new URL(bruto);
    const params = Object.fromEntries(u.searchParams.entries());
    const porta = u.port || '(por omissao)';

    return {
      definida: true,
      anfitriao: u.hostname,
      porta,
      parametros: params,
      schema: params.schema ?? '(nao indicado — usa `public`)',
      // Os dois poolers do Supabase distinguem-se so pela porta.
      modo: u.hostname.includes('pooler.supabase.com')
        ? porta === '6543'
          ? 'transacao (certo para serverless)'
          : porta === '5432'
            ? 'SESSAO — tecto de 15 ligacoes, esgota-se em serverless'
            : `porta inesperada: ${porta}`
        : 'ligacao directa ou outro fornecedor',
      pgbouncer: params.pgbouncer === 'true',
      connection_limit: params.connection_limit ?? '(nao indicado)',
    };
  } catch {
    return { definida: true, erro: 'DATABASE_URL nao e um URL valido' };
  }
}

export async function GET() {
  const inicio = Date.now();

  const relatorio: Record<string, unknown> = {
    ambiente: {
      NODE_ENV: process.env.NODE_ENV,
      naVercel: Boolean(process.env.VERCEL),
      regiao: process.env.VERCEL_REGION ?? null,
      APP_PASSWORD_definida: protegida(),
    },
    ligacao: ligacao(),
  };

  try {
    // Trivial de proposito: se isto falha, nao e por causa dos dados.
    await prisma.$queryRawUnsafe('select 1');

    const insumos = await prisma.ingredient.count();
    const fichas = await prisma.recipe.count();

    relatorio.banco = {
      ok: true,
      msLigacao: Date.now() - inicio,
      insumos,
      fichas,
    };
  } catch (err) {
    const e = err as { message?: string; code?: string; errorCode?: string };
    relatorio.banco = {
      ok: false,
      msAteFalhar: Date.now() - inicio,
      codigo: e.code ?? e.errorCode ?? null,
      // A mensagem do Prisma diz o que se passa; nao ha segredo nela.
      mensagem: e.message ?? String(err),
    };
  }

  const banco = relatorio.banco as { ok: boolean };
  return NextResponse.json(relatorio, { status: banco.ok ? 200 : 503 });
}
