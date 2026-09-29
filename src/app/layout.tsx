import type { Metadata, Viewport } from 'next';

import { BottomNav, TopNav } from '@/components/site-nav';
import { sair } from '@/lib/actions/auth';

import './globals.css';

export const metadata: Metadata = {
  title: 'Precificaragao',
  description:
    'Precificacao, engenharia de cardapio e lista de compras para lanchonete e restaurante.',
};

export const viewport: Viewport = {
  // Sem isto o telemovel renderiza a pagina a 980px e encolhe tudo.
  width: 'device-width',
  initialScale: 1,
  // A cor da barra do browser acompanha o tema.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-background">
        <div className="flex min-h-screen flex-col">
          <TopNav sair={sair} />

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
