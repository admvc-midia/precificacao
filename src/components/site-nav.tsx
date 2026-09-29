'use client';

/**
 * Navegacao.
 *
 * No ecra grande, a barra de cima com os sete destinos. No telemovel, uma
 * barra fixa em baixo com os cinco que se usam de facto — sete a fazer scroll
 * horizontal no topo nao se alcanca com o polegar, e e no telemovel que esta
 * app vai viver dentro do supermercado.
 *
 * Fornecedores e Configuracoes nao cabem na barra de baixo, mas continuam a um
 * toque: ficam como icones no canto superior direito, onde se mexe pouco.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ChefHat,
  ClipboardList,
  TrendingUp,
  Warehouse,
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  Store,
  Tag,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface Destino {
  href: string;
  label: string;
  /** Nome curto para a barra de baixo, onde o espaco e escasso. */
  short?: string;
  icon: typeof Boxes;
}

/** Os cinco que aparecem na barra do telemovel. */
const PRIMARIOS: Destino[] = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/insumos', label: 'Insumos', icon: Boxes },
  { href: '/fichas', label: 'Fichas tecnicas', short: 'Fichas', icon: ChefHat },
  { href: '/precificacao', label: 'Precificacao', short: 'Precos', icon: Tag },
  { href: '/producao', label: 'Producao', short: 'Compras', icon: ClipboardList },
];

/** Entra na barra de baixo apenas quando ha espaco; no topo aparece sempre. */
const ESTOQUE: Destino = {
  href: '/estoque',
  label: 'Estoque',
  icon: Warehouse,
};

/** Consultam-se de vez em quando; nao gastam lugar na barra de baixo. */
const SECUNDARIOS: Destino[] = [
  ESTOQUE,
  { href: '/vendas', label: 'Vendas e CMV real', icon: TrendingUp },
  { href: '/fornecedores', label: 'Fornecedores', icon: Store },
  { href: '/configuracoes', label: 'Configuracoes', icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  // "/" so casa exatamente; os outros casam tambem com as suas subpaginas,
  // para que /fichas/<id> mantenha "Fichas" marcado.
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * A pagina de entrada nao tem navegacao: nao ha para onde ir sem entrar, e
 * uma barra cheia de destinos inalcancaveis so faz parecer que a aplicacao
 * esta avariada.
 */
function semNavegacao(pathname: string): boolean {
  return pathname === '/entrar';
}

export function TopNav({ sair }: { sair?: () => Promise<void> }) {
  const pathname = usePathname();
  if (semNavegacao(pathname)) return null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <ChefHat className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Precificaragao</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {[...PRIMARIOS, ...SECUNDARIOS].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive(pathname, href)
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* No telemovel so os secundarios ficam aqui; os outros estao em baixo. */}
        <nav className="ml-auto flex items-center gap-1 md:hidden">
          {SECUNDARIOS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-md transition-colors',
                isActive(pathname, href)
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          ))}
        </nav>

        {sair ? (
          <form action={sair} className="shrink-0">
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  if (semNavegacao(pathname)) return null;

  return (
    <nav
      aria-label="Navegacao principal"
      // pb com safe-area: nos iPhones a barra de gestos comeria os rotulos.
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARIOS.map(({ href, label, short, icon: Icon }) => {
          const ativo = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  // min-h de 56px: alvo de toque confortavel com o polegar.
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] transition-colors',
                  ativo ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5', ativo && 'stroke-[2.5]')} />
                <span className="truncate">{short ?? label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
