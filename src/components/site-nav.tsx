'use client';

/**
 * Navegacao.
 *
 * No ecra grande, a barra de cima com uns poucos destinos soltos e grupos que
 * abrem um menu, mais o menu da engrenagem (configuracoes, conta, ajuda,
 * tema, sair). Dez destinos soltos numa linha nao cabiam e obrigavam a ler
 * todos para achar um.
 *
 * No telemovel, uma barra fixa em baixo com os que se usam de facto e o resto
 * num unico menu "Mais" no canto de cima.
 *
 * O menu depende do perfil: a cozinha e a leitura so tem o livro de
 * receitas. Esconder aqui e so arrumacao — quem decide o acesso e o proxy e
 * as actions, nunca o menu.
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Download,
  Factory,
  FolderOpen,
  HeartHandshake,
  History,
  Library,
  LifeBuoy,
  LineChart,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  BadgePercent,
  Megaphone,
  NotebookText,
  ShoppingBag,
  Ticket,
  UtensilsCrossed,
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
import type { Perfil } from '@/lib/auth';
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

/** A aba do comprador: na barra do telemovel, porque e a que se abre no supermercado. */
const COMPRAS: Destino = { href: '/compras', label: 'Compras', icon: ShoppingCart };
/** Tambem na barra do telemovel: e por onde comeca o dia de uma casa que trabalha por encomenda. */
const ENCOMENDAS: Destino = { href: '/encomendas', label: 'Encomendas', icon: ClipboardCheck };

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
  short: 'Producao',
  icon: ClipboardList,
};
const ESTOQUE: Destino = { href: '/estoque', label: 'Estoque', icon: Warehouse };
const VENDAS: Destino = { href: '/vendas', label: 'Resultados do mês', short: 'Resultados', icon: TrendingUp };
const DESPESAS: Destino = { href: '/despesas', label: 'Despesas fixas', icon: Wallet };
const RELATORIO: Destino = { href: '/relatorio', label: 'Relatório de vendas', icon: LineChart };
const CALENDARIO: Destino = { href: '/calendario', label: 'Calendário de produção', short: 'Calendário', icon: CalendarDays };
const CLIENTES: Destino = { href: '/clientes', label: 'Clientes', icon: Users };
const POS_VENDA: Destino = { href: '/pos-venda', label: 'Pós-venda e lembretes', short: 'Pós-venda', icon: HeartHandshake };
const RECEITAS: Destino = { href: '/receitas', label: 'Receitas', icon: BookOpen };
const LIVROS: Destino = { href: '/livros', label: 'Livros de receitas', short: 'Livros', icon: Library };
const CONFIGURACOES: Destino = {
  href: '/configuracoes',
  label: 'Configuracoes',
  icon: SettingsIcon,
};
const UTILIZADORES: Destino = { href: '/utilizadores', label: 'Utilizadores', icon: ShieldCheck };
const REGISTO: Destino = { href: '/registo', label: 'Registo de alterações', icon: History };
const CONTA: Destino = { href: '/conta', label: 'A minha conta', short: 'Conta', icon: UserRound };
const AJUDA: Destino = { href: '/ajuda', label: 'Ajuda', icon: LifeBuoy };
const CARDAPIO: Destino = { href: '/loja/cardapio', label: 'Cardápio (link público)', short: 'Cardápio', icon: UtensilsCrossed };
const PROMOCOES: Destino = { href: '/loja/promocoes', label: 'Promoções', icon: BadgePercent };
const CUPOES: Destino = { href: '/loja/cupoes', label: 'Cupões de desconto', short: 'Cupões', icon: Ticket };
const MARKETING: Destino = { href: '/marketing', label: 'Campanhas de marketing', short: 'Campanhas', icon: Megaphone };
const GUIA_MARKETING: Destino = { href: '/marketing/guia', label: 'Guia de marketing', short: 'Guia', icon: NotebookText };
const EXPORTAR: Destino = { href: '/exportar', label: 'Cópia de segurança', icon: Download };

interface MenuDoPerfil {
  /** Para onde leva o logotipo. */
  inicio: string;
  /** Soltos na barra de cima. */
  soltos: Destino[];
  grupos: Grupo[];
  /** No menu da engrenagem. */
  engrenagem: Destino[];
  /** Na barra de baixo do telemovel (ate cinco). */
  primarios: Destino[];
  /** No "Mais" do telemovel, antes dos da engrenagem. */
  noMais: Destino[];
}

/**
 * Dono: sem soltos — tudo em grupos, e o Painel e o logotipo (pedido dele,
 * 2026-10-08). Encomendas mora em Clientes; Compras em Cadastros. No
 * telemovel as duas continuam na barra de baixo: sao as do balcao e do
 * supermercado.
 */
const MENU_DONO: MenuDoPerfil = {
  inicio: '/',
  soltos: [],
  grupos: [
    // Pela ordem em que se fazem: sem insumos nao ha ficha, sem ficha nao ha preco.
    { label: 'Cadastros', icon: FolderOpen, destinos: [FORNECEDORES, INSUMOS, FICHAS, PRECIFICACAO, COMPRAS] },
    { label: 'Receitas', icon: BookOpen, destinos: [RECEITAS, LIVROS] },
    { label: 'Produção', icon: Factory, destinos: [PRODUCAO, ESTOQUE] },
    { label: 'Clientes', icon: Users, destinos: [ENCOMENDAS, CLIENTES, POS_VENDA] },
    { label: 'Loja', icon: ShoppingBag, destinos: [CARDAPIO, PROMOCOES, CUPOES, MARKETING] },
    { label: 'Resultados', icon: BarChart3, destinos: [VENDAS, RELATORIO, DESPESAS, CALENDARIO] },
  ],
  engrenagem: [CONFIGURACOES, UTILIZADORES, REGISTO, CONTA, EXPORTAR, AJUDA],
  primarios: [ENCOMENDAS, COMPRAS, FICHAS, PRODUCAO, CALENDARIO],
  noMais: [
    CLIENTES,
    POS_VENDA,
    CARDAPIO,
    PROMOCOES,
    CUPOES,
    MARKETING,
    RECEITAS,
    LIVROS,
    INSUMOS,
    PRECIFICACAO,
    FORNECEDORES,
    ESTOQUE,
    VENDAS,
    RELATORIO,
    DESPESAS,
  ],
};

/** Cozinha: o livro, e o que ha para fazer (encomendas, producao e o calendario, sem valores). */
const MENU_COZINHA: MenuDoPerfil = {
  inicio: '/encomendas',
  soltos: [ENCOMENDAS, PRODUCAO, CALENDARIO, RECEITAS, LIVROS],
  grupos: [],
  engrenagem: [CONTA, AJUDA],
  primarios: [ENCOMENDAS, PRODUCAO, CALENDARIO, RECEITAS, LIVROS],
  noMais: [],
};

/** Marketing: as campanhas e o guia. Sem o livro, sem valores. */
const MENU_MARKETING: MenuDoPerfil = {
  inicio: '/marketing',
  soltos: [MARKETING, GUIA_MARKETING],
  grupos: [],
  engrenagem: [CONTA, AJUDA],
  primarios: [MARKETING, GUIA_MARKETING, CONTA],
  noMais: [],
};

/** Leitura: so o livro. */
const MENU_LIVRO: MenuDoPerfil = {
  inicio: '/receitas',
  soltos: [RECEITAS, LIVROS],
  grupos: [],
  engrenagem: [CONTA, AJUDA],
  primarios: [RECEITAS, LIVROS, CONTA],
  noMais: [],
};

function menuDe(perfil: Perfil | null): MenuDoPerfil {
  if (perfil === 'MARKETING') return MENU_MARKETING;
  return perfil === 'OWNER' ? MENU_DONO : perfil === 'KITCHEN' ? MENU_COZINHA : MENU_LIVRO;
}

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
function semNavegacao(pathname: string, perfil: Perfil | null): boolean {
  return pathname === '/entrar' || perfil === null;
}

/** Botao da barra vinho: creme apagado, aceso quando e a pagina aberta. */
function estiloBarra(ativo: boolean) {
  return cn(
    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-brand-foreground/60',
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
  perfil,
  nome,
}: {
  sair?: () => Promise<void>;
  tema: Tema;
  perfil: Perfil | null;
  nome: string | null;
}) {
  const pathname = usePathname();
  const [tema, setTema] = useState<Tema>(temaInicial);
  const formSair = useRef<HTMLFormElement>(null);
  useSeguirAparelho(tema);

  if (semNavegacao(pathname, perfil)) return null;
  const menu = menuDe(perfil);

  // Um item de menu nao pode ser um <form>; o botao "Sair" submete este.
  const itemSair = sair ? (
    <DropdownMenuItem onSelect={() => formSair.current?.requestSubmit()}>
      <LogOut className="h-4 w-4 opacity-70" />
      Sair
    </DropdownMenuItem>
  ) : null;

  const quem = nome ? <DropdownMenuLabel className="font-normal text-muted-foreground">{nome}</DropdownMenuLabel> : null;

  return (
    <header className="sticky top-0 z-30 bg-brand text-brand-foreground shadow-xs">
      {sair ? <form ref={formSair} action={sair} className="hidden" /> : null}

      <div className="container flex h-14 items-center gap-2 md:gap-4">
        <Link
          href={menu.inicio}
          aria-label="Amo Brigs · Ateliê — inicio"
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
            Ateliê
          </span>
        </Link>

        {/* Ecra grande: os soltos e os grupos. */}
        <nav aria-label="Navegacao principal" className="hidden flex-1 items-center gap-1 md:flex">
          {menu.soltos.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={estiloBarra(isActive(pathname, href))}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}

          {menu.grupos.map(({ label, icon: Icon, destinos }) => (
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
              aria-label="Configuracoes, conta, ajuda e tema"
              title="Configuracoes, conta, ajuda e tema"
              className={cn(
                estiloBarra(menu.engrenagem.some((d) => isActive(pathname, d.href))),
                'px-2',
              )}
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {quem}
              {menu.engrenagem.map((d) => (
                <ItemLink key={d.href} destino={d} pathname={pathname} />
              ))}
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
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-brand-foreground/90 outline-hidden transition-colors hover:bg-brand-foreground/10 focus-visible:ring-2 focus-visible:ring-brand-foreground/60 data-[state=open]:bg-brand-foreground/10"
            >
              <Menu className="h-5 w-5" />
              Mais
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {quem}
              {menu.noMais.map((d) => (
                <ItemLink key={d.href} destino={d} pathname={pathname} />
              ))}
              {menu.noMais.length > 0 ? <DropdownMenuSeparator /> : null}
              {menu.engrenagem.map((d) => (
                <ItemLink key={d.href} destino={d} pathname={pathname} />
              ))}
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

export function BottomNav({ perfil }: { perfil: Perfil | null }) {
  const pathname = usePathname();
  if (semNavegacao(pathname, perfil)) return null;
  const { primarios } = menuDe(perfil);

  return (
    <nav
      aria-label="Atalhos"
      // pb com safe-area: nos iPhones a barra de gestos comeria os rotulos.
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${primarios.length}, minmax(0, 1fr))` }}
      >
        {primarios.map(({ href, label, short, icon: Icon }) => {
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
