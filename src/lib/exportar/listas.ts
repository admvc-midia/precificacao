/**
 * As listas que se podem descarregar. So nomes e textos — a pagina importa
 * isto sem arrastar o Prisma; quem gera o conteudo e `gerar.ts`.
 */

export const LISTAS = [
  {
    id: 'insumos',
    titulo: 'Insumos',
    descricao: 'Preco da embalagem, custo por kg, L ou unidade, estoque, minimo e alergenios.',
  },
  {
    id: 'fornecedores',
    titulo: 'Fornecedores',
    descricao: 'Morada, telefone, site e notas.',
  },
  {
    id: 'ofertas',
    titulo: 'Precos por fornecedor',
    descricao: 'Cada insumo em cada loja, e qual o preco em uso.',
  },
  {
    id: 'fichas',
    titulo: 'Fichas tecnicas',
    descricao: 'Uma linha por ingrediente de cada ficha, com rendimento e quantidades.',
  },
  {
    id: 'precos',
    titulo: 'Precos sugeridos',
    descricao: 'Custo, preco, CMV, margem e lucro de cada produto, no canal de referencia.',
  },
  {
    id: 'movimentos',
    titulo: 'Movimentos de estoque',
    descricao: 'Compras, producao, quebras, amostras, ajustes e contagens.',
  },
  {
    id: 'encomendas',
    titulo: 'Encomendas',
    descricao: 'Uma linha por produto de cada encomenda: cliente, entrega, estado, preco e pagamento.',
  },
  {
    id: 'despesas',
    titulo: 'Despesas fixas',
    descricao: 'Valor, periodicidade, categoria e se esta ativa.',
  },
] as const;

export type ListaId = (typeof LISTAS)[number]['id'];

export function eLista(id: string): id is ListaId {
  return LISTAS.some((l) => l.id === id);
}

/** Data de Lisboa para o nome do ficheiro: 2026-09-30. */
export function dataDoFicheiro(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);
}

export function nomeDoFicheiro(base: string, extensao: 'csv' | 'json', d = new Date()): string {
  return `precificacao-${base}-${dataDoFicheiro(d)}.${extensao}`;
}
