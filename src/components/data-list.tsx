'use client';

/**
 * Lista que e tabela no ecra grande e cartao no telemovel, com busca e
 * seccoes que se fecham.
 *
 * ---------------------------------------------------------------------------
 * PORQUE E QUE AS LINHAS CHEGAM JA RENDERIZADAS
 * ---------------------------------------------------------------------------
 * O padrao habitual seria `columns: [{ cell: (item) => ... }]`. Aqui nao da:
 * este componente e de cliente (precisa de estado para a busca e para o
 * aberto/fechado) e funcoes nao atravessam a fronteira servidor -> cliente.
 *
 * Entao o servidor monta cada linha ja com as celulas renderizadas — nodes de
 * React atravessam bem — e o cliente so decide quais mostrar e como as dispor.
 * O calculo de custos continua todo do lado do servidor, que e onde deve estar.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { Paginacao } from '@/components/paginacao';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { pagina } from '@/lib/paginacao';
import { useStoredString } from '@/lib/use-stored-state';
import { cn } from '@/lib/utils';

export interface ListColumn {
  header: string;
  align?: 'left' | 'right';
  /** Esconde a coluna em ecras medios, mantendo-a nos grandes. */
  hideBelow?: 'lg' | 'xl';
  className?: string;
}

export interface ListRow {
  id: string;
  /** Texto por onde a busca filtra. O servidor junta nome, fornecedor, etc. */
  search: string;
  /** Uma celula por coluna, na mesma ordem. */
  cells: React.ReactNode[];
  /** Telemovel: identificacao principal. */
  title: React.ReactNode;
  /** Telemovel: o numero que importa, no canto. */
  lead?: React.ReactNode;
  /** Telemovel: linha secundaria. */
  meta?: React.ReactNode;
  /** Botoes de editar/remover. */
  actions?: React.ReactNode;
  /** Destaque de erro (ficha com ciclo, por exemplo). */
  note?: React.ReactNode;
}

export interface ListGroup {
  /** Estavel entre visitas: e a chave com que se guarda aberto/fechado. */
  id: string;
  title: string;
  columns: ListColumn[];
  rows: ListRow[];
  empty: string;
  /** Comeca fechado. */
  collapsed?: boolean;
}

/** Minusculas sem acentos, para "Açúcar" casar com "acucar". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Chega para uma volta de olhos sem rolar demasiado, mesmo no telemovel. */
const POR_PAGINA = 20;

const hideClass = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

// ---------------------------------------------------------------------------

export function GroupedList({
  groups,
  searchPlaceholder,
  toolbar,
  storageKey,
  pageSize = POR_PAGINA,
}: {
  groups: ListGroup[];
  /** Sem isto nao aparece campo de busca. */
  searchPlaceholder?: string;
  /** Botoes a direita da busca, tipicamente "+ Novo". */
  toolbar?: React.ReactNode;
  /** Prefixo para lembrar que seccoes ficaram fechadas. */
  storageKey?: string;
  /** Linhas por pagina em cada seccao. */
  pageSize?: number;
}) {
  const [query, setQuery] = useState('');
  const needle = normalize(query.trim());

  const filtered = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        rows: needle
          ? g.rows.filter((r) => normalize(r.search).includes(needle))
          : g.rows,
      })),
    [groups, needle],
  );

  const total = filtered.reduce((a, g) => a + g.rows.length, 0);

  return (
    <div className="space-y-4">
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {searchPlaceholder ? (
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {/* Sempre dentro de um elemento proprio. Um componente de cliente
              passado solto pelo servidor (o FormDialog dos Fornecedores)
              fazia o React avisar de uma `key` em falta. */}
          {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
        </div>
      )}

      {needle && total === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nada encontrado para “{query}”.
        </p>
      ) : (
        filtered.map((group) => (
          <Section
            // A busca entra na chave: mudar o que se procura volta a pagina 1,
            // senao ficava-se na 3 de uma lista que agora so tem uma.
            key={`${group.id}|${needle}`}
            group={group}
            pageSize={pageSize}
            storageKey={storageKey ? `${storageKey}:${group.id}` : undefined}
            /* Uma busca a decorrer abre tudo: esconder resultados atras de uma
               seccao fechada faria parecer que nao ha nada. */
            forceOpen={Boolean(needle)}
          />
        ))
      )}
    </div>
  );
}

/** Uma lista simples, sem seccoes. */
export function DataList(props: {
  columns: ListColumn[];
  rows: ListRow[];
  empty: string;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
}) {
  const { columns, rows, empty, ...rest } = props;
  return (
    <GroupedList
      {...rest}
      groups={[{ id: 'all', title: '', columns, rows, empty }]}
    />
  );
}

// ---------------------------------------------------------------------------

function Section({
  group,
  storageKey,
  forceOpen,
  pageSize,
}: {
  group: ListGroup;
  storageKey?: string;
  forceOpen: boolean;
  pageSize: number;
}) {
  // A pagina nao se guarda entre visitas, ao contrario do aberto/fechado:
  // voltar a lista e reencontrar a pagina 4 desorienta mais do que ajuda.
  const [pedida, setPedida] = useState(1);
  const p = pagina(group.rows.length, pageSize, pedida);
  const fatia = group.rows.slice(p.inicio, p.fim);

  // Sem chave de persistencia o estado vive so nesta sessao (prefixo `mem:`).
  const [guardado, guardar] = useStoredString(
    storageKey ?? `mem:${group.id}`,
    group.collapsed ? '0' : '1',
  );

  const open = guardado === '1';
  const toggle = (next: boolean) => guardar(next ? '1' : '0');

  const visible = forceOpen || open;
  const semTitulo = group.title === '';

  return (
    <section className="rounded-lg border bg-card">
      {semTitulo ? null : (
        <h2>
          <button
            type="button"
            onClick={() => toggle(!open)}
            aria-expanded={visible}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:px-6"
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                visible ? '' : '-rotate-90',
              )}
              aria-hidden
            />
            <span className="flex-1 font-semibold">{group.title}</span>
            <Badge variant="secondary">{group.rows.length}</Badge>
          </button>
        </h2>
      )}

      {visible ? (
        group.rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
            {group.empty}
          </p>
        ) : (
          <>
            <TableView columns={group.columns} rows={fatia} />
            <CardView rows={fatia} />
            <Paginacao p={p} onChange={setPedida} className="border-t px-4 py-2 sm:px-6" />
          </>
        )
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function TableView({ columns, rows }: { columns: ListColumn[]; rows: ListRow[] }) {
  return (
    <div className="hidden md:block">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b">
            {columns.map((c, i) => (
              <th
                key={i}
                className={cn(
                  'h-11 px-3 align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground',
                  c.align === 'right' ? 'text-right' : 'text-left',
                  c.hideBelow ? hideClass[c.hideBelow] : '',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
            <th className="w-24" />
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {rows.map((row) => (
            <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
              {row.cells.map((cell, i) => {
                const c = columns[i];
                return (
                  <td
                    key={i}
                    className={cn(
                      'px-3 py-2.5 align-middle',
                      c?.align === 'right' ? 'text-right tabular-nums' : '',
                      c?.hideBelow ? hideClass[c.hideBelow] : '',
                    )}
                  >
                    {i === 0 && row.note ? (
                      <>
                        {cell}
                        <div className="mt-0.5 text-xs text-destructive">{row.note}</div>
                      </>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end">{row.actions}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardView({ rows }: { rows: ListRow[] }) {
  return (
    <ul className="divide-y md:hidden">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 font-medium">{row.title}</div>
              {row.lead ? (
                <div className="shrink-0 text-right tabular-nums">{row.lead}</div>
              ) : null}
            </div>
            {row.meta ? (
              <div className="mt-1 text-xs text-muted-foreground">{row.meta}</div>
            ) : null}
            {row.note ? (
              <div className="mt-1 text-xs text-destructive">{row.note}</div>
            ) : null}
          </div>
          {row.actions ? (
            <div className="flex shrink-0 items-center">{row.actions}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
