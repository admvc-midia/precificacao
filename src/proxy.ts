/**
 * Porteiro: nada se ve sem sessao, e cada perfil so passa onde pode.
 *
 * Chama-se `proxy.ts` e nao `middleware.ts` porque o Next 16 renomeou a
 * convencao. Corre no Node.js, o que permite usar `node:crypto` em
 * `lib/auth.ts`.
 *
 * Aqui so se le o cookie assinado — sem ir a base, para nao atrasar cada
 * pedido. A confirmacao de que a conta continua ativa e com o mesmo perfil
 * faz-se no layout (paginas) e em cada action (escritas): ver `lib/sessao.ts`.
 *
 * ---------------------------------------------------------------------------
 * FECHA POR OMISSAO
 * ---------------------------------------------------------------------------
 * Sem `APP_PASSWORD` definida, nenhum cookie e valido e tudo vai para
 * `/entrar`, que explica o que falta configurar.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { abertaSemSessao, COOKIE, inicioDoPerfil, lerSessao, rotaPermitida } from '@/lib/auth';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // O caminho segue para o layout, que precisa dele para confirmar a sessao
  // na base sem entrar em ciclo na propria pagina de entrada.
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set('x-caminho', pathname);
  const seguir = () => NextResponse.next({ request: { headers: cabecalhos } });

  if (abertaSemSessao(pathname)) return seguir();

  const sessao = lerSessao(request.cookies.get(COOKIE)?.value);
  if (!sessao) {
    const destino = new URL('/entrar', request.url);
    // Para devolver a pessoa ao sitio onde ia, depois de entrar. So caminhos
    // internos: a action de entrar volta a conferir.
    if (pathname !== '/') destino.searchParams.set('de', pathname + search);
    return NextResponse.redirect(destino);
  }

  if (!rotaPermitida(sessao.perfil, pathname)) {
    // As APIs respondem 403; as paginas mandam para o inicio do perfil.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ erro: 'Sem permissao.' }, { status: 403 });
    }
    return NextResponse.redirect(new URL(inicioDoPerfil(sessao.perfil), request.url));
  }

  return seguir();
}

export const config = {
  /**
   * Tudo menos o que o browser precisa antes de haver sessao. Sem esta
   * exclusao, a propria pagina de entrada ficaria sem estilos nem JavaScript.
   *
   * Os ficheiros soltos vao pelo NOME EXATO, com `$` no fim. Um prefixo como
   * `icon` ou `logo-` deixaria tambem passar, sem sessao, qualquer rota futura
   * que comecasse assim (`/iconografia`) — e nada avisaria. So as duas pastas
   * do `_next` ficam por prefixo, porque tem subcaminhos. Um ficheiro novo em
   * `public/` que a pagina de entrada ou o cardapio publico precisem tem de
   * entrar nesta lista (o cardapio usa o logotipo e a estampa, e a imagem
   * `cardapio-partilha.png` das redes sociais).
   */
  matcher: [
    '/((?!_next/static|_next/image|(?:favicon\\.ico|robots\\.txt|icon\\.svg|apple-icon\\.png|logo-creme\\.png|logo-vinho\\.png|estampa\\.svg|estampa-escura\\.svg|cardapio-partilha\\.png)$).*)',
  ],
};
