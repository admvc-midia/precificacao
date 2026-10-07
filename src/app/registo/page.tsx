import { History } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { Paginacao } from '@/components/paginacao';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';
import { prisma } from '@/lib/db';
import { pagina } from '@/lib/paginacao';
import { exigirDono } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

/** Os grupos do filtro: o comeco do nome da acao. */
const GRUPOS: Record<string, string> = {
  entrar: 'Entradas',
  conta: 'Contas',
  configuracoes: 'Configurações',
  despesas: 'Despesas',
  insumo: 'Insumos',
  preco: 'Preços',
  ficha: 'Fichas',
  estoque: 'Estoque',
  compras: 'Compras',
  encomenda: 'Encomendas',
  cliente: 'Clientes',
  receita: 'Receitas',
  livro: 'Livros',
};

const dataFmt = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Lisbon',
});

export default async function RegistoPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string; pag?: string }>;
}) {
  await exigirDono();
  const sp = await searchParams;
  const grupo = sp.grupo && sp.grupo in GRUPOS ? sp.grupo : null;
  const where = grupo ? { action: { startsWith: grupo } } : {};

  const total = await prisma.auditLog.count({ where });
  const p = pagina(total, POR_PAGINA, Number(sp.pag ?? 1));
  const linhas = await prisma.auditLog.findMany({
    where,
    orderBy: { at: 'desc' },
    skip: p.inicio,
    take: POR_PAGINA,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <History className="h-5 w-5 text-primary" aria-hidden />
            Registo de alterações
            <AjudaLink secao="utilizadores" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Quem mudou o quê, e quando: entradas na app, contas, preços, configurações,
            encomendas, o que se apagou. Nada aqui se altera nem se apaga.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <Select name="grupo" defaultValue={grupo ?? ''} aria-label="Tipo" className="w-48">
            <option value="">Tudo</option>
            {Object.entries(GRUPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonVariants({ variant: 'outline' })}>
            Ver
          </button>
        </form>
      </header>

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nada registado{grupo ? ' deste tipo' : ''} ainda.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {linhas.map((l) => (
            <li key={l.id} className="space-y-0.5 px-4 py-2.5 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-muted-foreground">{dataFmt.format(l.at)}</span>
                <span className="font-medium">{l.userName}</span>
                <Badge variant={l.action.endsWith('falhou') || l.action.endsWith('apagar') ? 'warning' : 'secondary'}>
                  {l.action}
                </Badge>
                {l.target ? <span className="break-all">{l.target}</span> : null}
              </p>
              {l.detail ? <p className="break-all text-xs text-muted-foreground">{l.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <Paginacao
        p={p}
        href={(n) => {
          const q = new URLSearchParams();
          if (grupo) q.set('grupo', grupo);
          if (n > 1) q.set('pag', String(n));
          const s = q.toString();
          return s ? `/registo?${s}` : '/registo';
        }}
      />
    </div>
  );
}
