/**
 * Porteiro: nada se ve sem a palavra-passe.
 *
 * Chama-se `proxy.ts` e nao `middleware.ts` porque o Next 16 renomeou a
 * convencao. Corre no Node.js, o que permite usar `node:crypto` em
 * `lib/auth.ts` sem reescrever a assinatura em Web Crypto.
 *
 * ---------------------------------------------------------------------------
 * FECHA POR OMISSAO
 * ---------------------------------------------------------------------------
 * Sem `APP_PASSWORD` definida, isto **nao** deixa a aplicacao aberta: manda
 * tudo para `/entrar`, que explica o que falta configurar. Uma aplicacao de
 * custos aberta na internet e um problema silencioso — quem apanhe o link
 * altera precos e estoque, e nada no ecra denuncia que assim e.
 *
 * O senao esta dito em voz alta no README: quem publicar sem definir a
 * variavel fica de fora ate a definir.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { COOKIE, sessaoValida } from '@/lib/auth';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // A propria pagina de entrada, senao nao havia como entrar.
  if (pathname === '/entrar') return NextResponse.next();

  if (sessaoValida(request.cookies.get(COOKIE)?.value)) {
    return NextResponse.next();
  }

  const destino = new URL('/entrar', request.url);
  // Para devolver a pessoa ao sitio onde ia, depois de entrar. So caminhos
  // internos: um `de=https://outro-sitio` seria um redirecionamento aberto.
  if (pathname !== '/') destino.searchParams.set('de', pathname + search);

  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Tudo menos o que o browser precisa antes de haver sessao. Sem esta
   * exclusao, a propria pagina de entrada ficaria sem estilos nem JavaScript,
   * porque os pedidos deles tambem seriam redirecionados.
   *
   * O logotipo e a estampa (em `public/`) tambem: a pagina de entrada mostra-os
   * antes do login, e nao tem nada da casa.
   *
   * Os ficheiros soltos vao pelo NOME EXATO, com `$` no fim. Um prefixo como
   * `icon` ou `logo-` deixaria tambem passar, sem palavra-passe, qualquer rota
   * futura que comecasse assim (`/iconografia`) — e nada avisaria. So as duas
   * pastas do `_next` ficam por prefixo, porque tem subcaminhos. Um ficheiro
   * novo em `public/` que a pagina de entrada precise tem de entrar nesta lista.
   */
  matcher: [
    '/((?!_next/static|_next/image|(?:favicon\\.ico|robots\\.txt|icon\\.svg|apple-icon\\.png|logo-creme\\.png|logo-vinho\\.png|estampa\\.svg|estampa-escura\\.svg)$).*)',
  ],
};
