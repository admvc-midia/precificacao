'use client';

/**
 * Navegacao.
 *
 * No ecra grande, a barra de cima com o Painel e tres grupos que abrem um
 * menu — Cadastros, Producao, Resultados — mais o menu da engrenagem
 * (configuracoes, ajuda, tema, sair). Dez destinos soltos numa linha nao
 * cabiam e obrigavam a ler todos para achar um.
 *
 * Os Cadastros estao pela ordem em que se fazem: sem insumos nao ha ficha,
 * sem ficha nao ha preco. Quem le o menu de cima para baixo le o caminho.
 *
 * No telemovel, uma barra fixa em baixo com os cinco que se usam de facto —
 * e no telemovel que esta app vive dentro do supermercado — e o resto num
 * unico menu "Mais" no canto de cima.
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Factory,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Store,
  Tag,
  TrendingUp,
  Wallet,
  Warehouse,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { aplicarTema, guardarTema, lerTema, TEMAS, type Tema } from '@/lib/tema';
import { cn } from '@/lib/utils';

interface Destino {
  href: string;
  label: string;
  /** Nome curto para a barra de baixo, onde o espaco e escasso. */
  short?: string;
  icon: typeof Boxes;
}

interface Grupo {
  label: string;
  icon: typeof Boxes;
  destinos: Destino[];
}

const PAINEL: Destino = { href: '/', label: 'Painel', icon: LayoutDashboard };

const FORNECEDORES: Destino = { href: '/fornecedores', label: 'Fornecedores', icon: Store };
const INSUMOS: Destino = { href: '/insumos', label: 'Insumos', icon: Boxes };
const FICHAS: Destino = {
  href: '/fichas',
  label: 'Fichas tecnicas',
  short: 'Fichas',
  icon: ChefHat,
};
const PRECIFICACAO: Destino = {
  href: '/precificacao',
  label: 'Precificacao',
  short: 'Precos',
  icon: Tag,
};
const PRODUCAO: Destino = {
  href: '/producao',
  label: 'Producao e compras',
  short: 'Compras',
  icon: ClipboardList,
};
const ESTOQUE: Destino = { href: '/estoque', label: 'Estoque', icon: Warehouse };
const VENDAS: Destino = { href: '/vendas', label: 'Vendas e CMV real', icon: TrendingUp };
const DESPESAS: Destino = { href: '/despesas', label: 'Despesas fixas', icon: Wallet };
const CONFIGURACOES: Destino = {
  href: '/configuracoes',
  label: 'Configuracoes',
  icon: SettingsIcon,
};
const AJUDA: Destino = { href: '/ajuda', label: 'Ajuda', icon: LifeBuoy };

const GRUPOS: Grupo[] = [
  {
    label: 'Cadastros',
    icon: FolderOpen,
    destinos: [FORNECEDORES, INSUMOS, FICHAS, PRECIFICACAO],
  },
  { label: 'Produção', icon: Factory, destinos: [PRODUCAO, ESTOQUE] },
  { label: 'Resultados', icon: BarChart3, destinos: [VENDAS, DESPESAS] },
];

/** Os cinco que aparecem na barra do telemovel. */
const PRIMARIOS: Destino[] = [PAINEL, INSUMOS, FICHAS, PRECIFICACAO, PRODUCAO];

/** O que no telemovel nao cabe em baixo e vai para o menu "Mais". */
const NO_MAIS: Destino[] = [FORNECEDORES, ESTOQUE, VENDAS, DESPESAS];

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

/** Botao da barra vinho: creme apagado, aceso quando e a pagina aberta. */
function estiloBarra(ativo: boolean) {
  return cn(
    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-foreground/60',
    ativo
      ? 'bg-brand-foreground/15 font-medium text-brand-foreground'
      : 'text-brand-foreground/75 hover:bg-brand-foreground/10 hover:text-brand-foreground data-[state=open]:bg-brand-foreground/10 data-[state=open]:text-brand-foreground',
  );
}

/** Um item de menu que e um link, marcado quando e a pagina aberta. */
function ItemLink({ destino, pathname }: { destino: Destino; pathname: string }) {
  const { href, label, icon: Icon } = destino;
  const ativo = isActive(pathname, href);
  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={ativo ? 'page' : undefined}
        className={cn(ativo && 'font-medium text-primary')}
      >
        <Icon className="h-4 w-4 opacity-70" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * A escolha do tema, dentro de um menu. Aplica logo na pagina aberta e guarda
 * no cookie para as proximas.
 */
function EscolhaTema({ tema, onChange }: { tema: Tema; onChange: (t: Tema) => void }) {
  return (
    <>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={tema}
        onValueChange={(valor) => {
          const novo = lerTema(valor);
          aplicarTema(novo);
          guardarTema(novo);
          onChange(novo);
        }}
      >
        {TEMAS.map(({ valor, rotulo }) => (
          <DropdownMenuRadioItem
            key={valor}
            value={valor}
            // Sem isto o menu fecha ao escolher e nao se ve o visto mudar.
            onSelect={(e) => e.preventDefault()}
          >
            {rotulo}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/**
 * Em "automatico", acompanha o aparelho se ele mudar com a pagina aberta
 * (o telemovel que passa a escuro ao por do sol).
 */
function useSeguirAparelho(tema: Tema) {
  useEffect(() => {
    if (tema !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const mudou = () => aplicarTema('auto');
    media.addEventListener('change', mudou);
    return () => media.removeEventListener('change', mudou);
  }, [tema]);
}

export function TopNav({
  sair,
  tema: temaInicial,
}: {
  sair?: () => Promise<void>;
  tema: Tema;
}) {
  const pathname = usePathname();
  const [tema, setTema] = useState<Tema>(temaInicial);
  const formSair = useRef<HTMLFormElement>(null);
  useSeguirAparelho(tema);

  if (semNavegacao(pathname)) return null;

  // Um item de menu nao pode ser um <form>; o botao "Sair" submete este.
  const itemSair = sair ? (
    <DropdownMenuItem onSelect={() => formSair.current?.requestSubmit()}>
      <LogOut className="h-4 w-4 opacity-70" />
      Sair
    </DropdownMenuItem>
  ) : null;

  return (
    <header className="sticky top-0 z-30 bg-brand text-brand-foreground shadow-sm">
      {sair ? <form ref={formSair} action={sair} className="hidden" /> : null}

      <div className="container flex h-14 items-center gap-2 md:gap-4">
        <Link
          href="/"
          aria-label="Amo Brigs · Precificação — Painel"
          className="flex shrink-0 items-center gap-2.5"
        >
          {/* 1200x342: o logotipo recortado rente ao desenho. */}
          <Image
            src="/logo-creme.png"
            alt=""
            width={1200}
            height={342}
            priority
            className="h-8 w-auto"
          />
          <span className="hidden border-l border-brand-foreground/30 pl-2.5 font-titulo text-lg leading-none lg:inline">
            Precificação
          </span>
        </Link>

        {/* Ecra grande: Painel e os tres grupos. */}
        <nav aria-label="Navegacao principal" className="hidden flex-1 items-center gap-1 md:flex">
          <Link
            href="/"
            aria-current={isActive(pathname, '/') ? 'page' : undefined}
            className={estiloBarra(isActive(pathname, '/'))}
          >
            <LayoutDashboard className="h-4 w-4" />
            Painel
          </Link>

          {GRUPOS.map(({ label, icon: Icon, destinos }) => (
            <DropdownMenu key={label} modal={false}>
              <DropdownMenuTrigger
                className={estiloBarra(destinos.some((d) => isActive(pathname, d.href)))}
              >
                <Icon className="h-4 w-4" />
                {label}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {destinos.map((d) => (
                  <ItemLink key={d.href} destino={d} pathname={pathname} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </nav>

        {/* Ecra grande: a engrenagem. */}
        <div className="ml-auto hidden md:block">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label="Configuracoes, ajuda e tema"
              title="Configuracoes, ajuda e tema"
              className={cn(
                estiloBarra(isActive(pathname, CONFIGURACOES.href) || isActive(pathname, AJUDA.href)),
                'px-2',
              )}
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ItemLink destino={CONFIGURACOES} pathname={pathname} />
              <ItemLink destino={AJUDA} pathname={pathname} />
              <DropdownMenuSeparator />
              <EscolhaTema tema={tema} onChange={setTema} />
              {itemSair ? (
                <>
                  <DropdownMenuSeparator />
                  {itemSair}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Telemovel: tudo o que nao esta na barra de baixo, num menu so. */}
        <div className="ml-auto md:hidden">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label="Mais"
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-brand-foreground/90 outline-none transition-colors hover:bg-brand-foreground/10 focus-visible:ring-2 focus-visible:ring-brand-foreground/60 data-[state=open]:bg-brand-foreground/10"
            >
              <Menu className="h-5 w-5" />
              Mais
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {NO_MAIS.map((d) => (
                <ItemLink key={d.href} destino={d} pathname={pathname} />
              ))}
              <DropdownMenuSeparator />
              <ItemLink destino={CONFIGURACOES} pathname={pathname} />
              <ItemLink destino={AJUDA} pathname={pathname} />
              <DropdownMenuSeparator />
              <EscolhaTema tema={tema} onChange={setTema} />
              {itemSair ? (
                <>
                  <DropdownMenuSeparator />
                  {itemSair}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  if (semNavegacao(pathname)) return null;

  return (
    <nav
      aria-label="Atalhos"
      // pb com safe-area: nos iPhones a barra de gestos comeria os rotulos.
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
