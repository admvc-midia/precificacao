/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // O limite padrao de 1 MB chega para os formularios, mas a importacao de
    // listas de precos em CSV pode passar disso. A chave continua sob
    // `experimental` no Next 16 — o aviso "Experiments" no build e informativo.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
