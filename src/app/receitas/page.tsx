import Link from 'next/link';
import { Archive, FileUp, History, Plus, Search } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { podeEditarLivro } from '@/lib/auth';
import { fotoReceitaSrc } from '@/lib/foto-url';
import { listarReceitas, todasAsEtiquetas } from '@/lib/livro/consultas';
import { linhas, SOURCE_KIND_LABEL, type SourceKind } from '@/lib/livro/receita';
import { exigirSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etiqueta?: string; origem?: string; arquivadas?: string }>;
}) {
  const eu = await exigirSessao();
  const sp = await searchParams;
  const origem = sp.origem && sp.origem in SOURCE_KIND_LABEL ? (sp.origem as SourceKind) : undefined;
  const arquivadas = sp.arquivadas === '1';

  const [receitas, etiquetas] = await Promise.all([
    listarReceitas({ busca: sp.q, etiqueta: sp.etiqueta, origem, arquivadas }),
    todasAsEtiquetas(),
  ]);
  const editor = podeEditarLivro(eu.perfil);
  const filtrado = Boolean(sp.q || sp.etiqueta || origem);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {arquivadas ? 'Receitas arquivadas' : 'Receitas'}
            <AjudaLink secao="receitas" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O livro da casa: de onde veio cada receita, e cada alteração que a cozinha lhe fez.
          </p>
        </div>
        {editor && !arquivadas ? (
          <div className="flex w-full gap-2 sm:w-auto">
            <Link href="/receitas/importar" className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 sm:flex-none')}>
              <FileUp className="h-4 w-4" />
              Importar
            </Link>
            <Link href="/receitas/nova" className={cn(buttonVariants(), 'flex-1 sm:flex-none')}>
              <Plus className="h-4 w-4" />
              Nova receita
            </Link>
          </div>
        ) : null}
      </header>

      {/* Filtros: um formulario GET, funciona sem JavaScript e o link guarda a busca. */}
      <form className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem_auto]">
        {arquivadas ? <input type="hidden" name="arquivadas" value="1" /> : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Procurar por nome, ingrediente, origem…"
            className="pl-9"
            aria-label="Procurar receitas"
          />
        </div>
        <Select name="origem" defaultValue={origem ?? ''} aria-label="Origem">
          <option value="">Todas as origens</option>
          {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
            <option key={k} value={k}>
              {SOURCE_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select name="etiqueta" defaultValue={sp.etiqueta ?? ''} aria-label="Etiqueta">
          <option value="">Todas as etiquetas</option>
          {etiquetas.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          Procurar
        </button>
      </form>

      {receitas.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {filtrado
            ? 'Nenhuma receita com esta busca.'
            : arquivadas
              ? 'Não há receitas arquivadas.'
              : editor
                ? 'Ainda não há receitas. Escreva a primeira, ou importe um PDF.'
                : 'Ainda não há receitas.'}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {receitas.map((r) => {
            const ingredientes = linhas(r.atual?.ingredients ?? '');
            return (
              <li key={r.id}>
                <Link
                  href={`/receitas/${r.id}`}
                  className="flex h-full flex-col gap-2 overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  {r.photoThumbPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- rota com sessao; o otimizador do next/image pede-a sem cookie
                    <img
                      src={fotoReceitaSrc(r.id, r.photoThumbPath, 'mini')!}
                      alt=""
                      loading="lazy"
                      className="-mx-4 -mt-4 mb-1 aspect-video w-[calc(100%+2rem)] max-w-none object-cover"
                    />
                  ) : null}
                  <span className="font-titulo text-lg font-semibold leading-tight">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.sourceKind ? SOURCE_KIND_LABEL[r.sourceKind] : null, r.sourceName]
                      .filter(Boolean)
                      .join(' · ') || 'Origem por indicar'}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {ingredientes.slice(0, 5).join(' · ')}
                    {ingredientes.length > 5 ? '…' : ''}
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    {r.totalVersoes > 1 ? (
                      <Badge variant="secondary">
                        <History className="mr-1 h-3 w-3" aria-hidden />
                        versão {r.currentVersion} de {r.totalVersoes}
                      </Badge>
                    ) : (
                      <Badge variant="outline">original</Badge>
                    )}
                    {r.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                    {r.entries.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        em {r.entries.map((e) => e.cookbook.title).join(', ')}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm">
        {arquivadas ? (
          <Link href="/receitas" className="text-primary hover:underline">
            ← Voltar às receitas
          </Link>
        ) : (
          <Link href="/receitas?arquivadas=1" className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline">
            <Archive className="h-3.5 w-3.5" aria-hidden />
            Ver as arquivadas
          </Link>
        )}
      </p>
    </div>
  );
}
