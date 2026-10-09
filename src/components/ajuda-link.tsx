/**
 * O "?" ao lado do titulo de cada pagina: leva a secao certa da Ajuda, ja
 * aberta. O `secao` tem de ser um dos `id` de `app/ajuda/page.tsx`.
 */

import Link from 'next/link';
import { CircleHelp } from 'lucide-react';

export type SecaoAjuda =
  | 'configuracoes'
  | 'fornecedores'
  | 'insumos'
  | 'fichas'
  | 'precificacao'
  | 'producao'
  | 'estoque'
  | 'vendas'
  | 'despesas'
  | 'painel'
  | 'exportar'
  | 'compras'
  | 'encomendas'
  | 'clientes'
  | 'pos-venda'
  | 'relatorio'
  | 'receitas'
  | 'calendario'
  | 'utilizadores'
  | 'cardapio'
  | 'promocoes'
  | 'cupoes'
  | 'marketing';

export function AjudaLink({ secao }: { secao: SecaoAjuda }) {
  return (
    <Link
      href={`/ajuda#${secao}`}
      aria-label="Ajuda sobre esta pagina"
      title="Ajuda sobre esta pagina"
      className="ml-2 inline-flex translate-y-[-2px] align-middle text-muted-foreground transition-colors hover:text-primary print:hidden"
    >
      <CircleHelp className="h-[18px] w-[18px]" />
    </Link>
  );
}
