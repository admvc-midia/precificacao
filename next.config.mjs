/** @type {import('next').NextConfig} */
const nextConfig = {
  // Para a pagina de Ajuda dizer que versao esta publicada. Ficam gravados no
  // momento do build: a data de hoje e, na Vercel, o commit que foi publicado.
  // Localmente nao ha commit, e a Ajuda diz "desenvolvimento".
  env: {
    APP_BUILD_DATE: new Date().toISOString(),
    APP_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  },
  experimental: {
    // O limite padrao de 1 MB chega para os formularios, mas a importacao de
    // listas de precos em CSV pode passar disso. A chave continua sob
    // `experimental` no Next 16 — o aviso "Experiments" no build e informativo.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
