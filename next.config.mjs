const producao = process.env.NODE_ENV === 'production';

/**
 * Politica de conteudo das paginas: de onde podem vir scripts, imagens,
 * estilos, e quem pode meter a app dentro de uma moldura.
 *
 * - `'unsafe-inline'` nos scripts: o Next poe scripts seus dentro da pagina
 *   (os dados do React e o do tema), e tira-lo obrigava a um nonce por pedido.
 *   Mesmo assim fica fechado o que importa: nenhum script de outro sitio,
 *   nenhuma moldura, nenhum plugin, nenhum formulario a enviar para fora.
 * - `'unsafe-eval'` e `ws:` so em desenvolvimento: o recarregamento do webpack
 *   precisa deles; a app publicada nao.
 * - `blob:` e `data:` nas imagens: a pre-visualizacao da foto, reduzida no
 *   telemovel antes de enviar, e um blob.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${producao ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${producao ? '' : ' ws: wss:'}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(producao ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** Em todas as respostas, paginas e ficheiros. */
const COMUNS = [
  // Nao adivinhar o tipo de um ficheiro: um "PDF" que fosse HTML nao corre.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Para browsers antigos que nao leem o frame-ancestors da CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Um link para fora (WhatsApp, a fonte de uma receita) nao leva o caminho da pagina.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nada disto e usado; a foto vem do seletor de ficheiros, nao da camara direta.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(producao
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `npm run dev:teste` usa outra pasta: o Next 16 so deixa correr um
  // `next dev` por pasta de build, e assim corre ao lado do `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Para a pagina de Ajuda dizer que versao esta publicada. Ficam gravados no
  // momento do build: a data de hoje e, na Vercel, o commit que foi publicado.
  // Localmente nao ha commit, e a Ajuda diz "desenvolvimento".
  env: {
    APP_BUILD_DATE: new Date().toISOString(),
    APP_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  },
  // Nao anunciar a versao do Next a quem pergunta.
  poweredByHeader: false,
  experimental: {
    // O limite padrao de 1 MB chega para os formularios, mas a importacao de
    // listas de precos em CSV e de receitas em PDF passa disso. 4 MB e o tecto:
    // a Vercel recusa pedidos acima de 4,5 MB antes de chegarem a app. A chave continua sob
    // `experimental` no Next 16 — o aviso "Experiments" no build e informativo.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: COMUNS },
      // A CSP so nas paginas: as rotas /api entregam ficheiros (o PDF original,
      // as fotos), e o leitor de PDF do browser nao abre debaixo dela.
      { source: '/((?!api/).*)', headers: [{ key: 'Content-Security-Policy', value: CSP }] },
    ];
  },
};

export default nextConfig;
