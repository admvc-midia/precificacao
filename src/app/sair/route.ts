/**
 * Apaga o cookie e manda para a entrada.
 *
 * Existe porque o layout descobre, ao confirmar na base, que uma sessao ja nao
 * vale (conta desativada, perfil mudado, palavra-passe trocada) — e um layout
 * nao pode apagar cookies. Redireciona para aqui, e aqui pode.
 *
 * GET sem efeitos para alem de sair: no pior caso, um link malicioso tira
 * alguem da sessao, que e o que o botao Sair tambem faz.
 */

import { NextResponse } from 'next/server';

import { COOKIE } from '@/lib/auth';

export function GET(request: Request) {
  const destino = new URL('/entrar', request.url);
  if (new URL(request.url).searchParams.get('motivo') === 'sessao') {
    destino.searchParams.set('motivo', 'sessao');
  }
  const resposta = NextResponse.redirect(destino);
  resposta.cookies.delete(COOKIE);
  return resposta;
}
