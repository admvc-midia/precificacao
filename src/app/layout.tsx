import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Boxes,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Settings as SettingsIcon,
  Store,
  Tag,
} from 'lucide-react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Precificaragao',
  description:
    'Precificacao, engenharia de cardapio e lista de compras para lanchonete e restaurante.',
};

const NAV = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/insumos', label: 'Insumos', icon: Boxes },
  { href: '/fornecedores', label: 'Fornecedores', icon: Store },
  { href: '/fichas', label: 'Fichas tecnicas', icon: ChefHat },
  { href: '/precificacao', label: 'Precificacao', icon: Tag },
  { href: '/producao', label: 'Producao', icon: ClipboardList },
  { href: '/configuracoes', label: 'Configuracoes', icon: SettingsIcon },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-background">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
            <div className="container flex h-14 items-center gap-6">
              <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
                  <ChefHat className="h-4 w-4" />
                </span>
                Precificaragao
              </Link>

              <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto">
                {NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          <main className="container flex-1 py-6">{children}</main>

          <footer className="border-t py-4">
            <div className="container text-xs text-muted-foreground">
              Os precos sugeridos sao uma recomendacao calculada a partir das taxas
              que voce configurou. Confira sempre a aliquota de IVA aplicavel ao seu
              caso.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
