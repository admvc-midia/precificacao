import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond } from 'next/font/google';
import { cookies } from 'next/headers';
import Script from 'next/script';

import { BottomNav, TopNav } from '@/components/site-nav';
import { sair } from '@/lib/actions/auth';
import { COOKIE_TEMA, lerTema, SCRIPT_TEMA } from '@/lib/tema';

import './globals.css';

// A serifada dos titulos, parecida com a do logotipo. O Next descarrega-a no
// build e serve-a do proprio dominio — o browser nao fala com o Google.
const titulo = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-titulo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Amo Brigs · Precificação',
  description:
    'Precificacao, engenharia de cardapio e lista de compras para lanchonete e restaurante.',
};

// A barra do browser continua a barra de cima da app: vinho, mais fundo no
// tema escuro (as mesmas cores que --brand em globals.css).
const VINHO = '#5b1c32';
const VINHO_ESCURO = '#3f1323';

export async function generateViewport(): Promise<Viewport> {
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);
  return {
    // Sem isto o telemovel renderiza a pagina a 980px e encolhe tudo.
    width: 'device-width',
    initialScale: 1,
    themeColor:
      tema === 'claro'
        ? VINHO
        : tema === 'escuro'
          ? VINHO_ESCURO
          : [
              { media: '(prefers-color-scheme: light)', color: VINHO },
              { media: '(prefers-color-scheme: dark)', color: VINHO_ESCURO },
            ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    // `dark` ja vem do servidor quando a escolha e escuro; em automatico e o
    // script abaixo que decide, e por isso a classe pode diferir da do
    // servidor — daí o suppressHydrationWarning.
    <html
      lang="pt-PT"
      data-tema={tema}
      className={`${titulo.variable}${tema === 'escuro' ? ' dark' : ''}`}
      suppressHydrationWarning
    >
      <head>
        {/* beforeInteractive: vai no HTML inicial e corre antes de pintar.
            Um <script> direto no JSX o React 19 recusa-se a executar. */}
        <Script id="tema" strategy="beforeInteractive">
          {SCRIPT_TEMA}
        </Script>
      </head>
      <body className="min-h-screen bg-background">
        <div className="flex min-h-screen flex-col">
          <TopNav sair={sair} tema={tema} />

          {/* pb-24 no telemovel: a barra de baixo e fixa e taparia o fim da
              pagina. Acima de md ela nao existe e o espaco volta ao normal. */}
          <main className="container flex-1 py-6 pb-24 md:pb-6">{children}</main>

          <footer className="border-t py-4 pb-24 md:pb-4">
            <div className="container text-xs text-muted-foreground">
              Os precos sugeridos sao uma recomendacao calculada a partir das taxas
              que voce configurou. Confira sempre a aliquota de IVA aplicavel ao seu
              caso.
            </div>
          </footer>

          <BottomNav />
        </div>
      </body>
    </html>
  );
}
