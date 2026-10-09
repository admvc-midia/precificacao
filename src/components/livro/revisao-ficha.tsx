'use client';

/**
 * Rever, linha a linha, a ficha tecnica proposta a partir de uma receita do
 * livro: incluir ou nao, o insumo (ou preparacao base) e a quantidade.
 *
 * A unidade de cada linha sai do que se escolhe (kg, L ou un), como na ficha.
 * Submete com `onSubmit` + `startTransition`, como a nova encomenda: um erro
 * do servidor ("linha 3 sem quantidade") nao pode apagar o que ja se reviu.
 */

import { useActionState, useState, useTransition } from 'react';
import { AlertTriangle, Loader2, XCircle } from 'lucide-react';

import type { ActionState } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { criarFichaDaReceita } from '@/lib/actions/livro';
import { cn } from '@/lib/utils';

export interface OpcaoDeInsumo {
  ref: string;
  nome: string;
  /** kg, L ou un. */
  unidade: string;
  grupo: 'Insumos' | 'Preparações base';
}

export interface LinhaProposta {
  original: string;
  titulo: boolean;
  ref: string;
  /** Na unidade de exibicao, com virgula; vazio quando nao se converte. */
  qty: string;
  /** Porque a quantidade nao veio sozinha. */
  motivo: string | null;
  incluir: boolean;
}

const INICIAL: ActionState = { ok: true };

export function RevisaoFicha({
  receitaId,
  nomeInicial,
  rendimentoInicial,
  opcoes,
  linhas: iniciais,
}: {
  receitaId: string;
  nomeInicial: string;
  rendimentoInicial: string;
  opcoes: OpcaoDeInsumo[];
  linhas: LinhaProposta[];
}) {
  const [estado, acao] = useActionState(criarFichaDaReceita, INICIAL);
  const [aEnviar, startTransition] = useTransition();
  const [linhas, setLinhas] = useState(iniciais);
  const unidadeDe = new Map(opcoes.map((o) => [o.ref, o.unidade]));
  const mudar = (i: number, campo: Partial<LinhaProposta>) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));

  const porFazer = linhas.filter((l) => l.incluir && (!l.ref || !l.qty.trim())).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={receitaId} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Nome da ficha técnica" htmlFor="rf-nome">
          <Input id="rf-nome" name="name" defaultValue={nomeInicial} required />
        </Field>
        <Field label="Rende (unidades ou porções)" htmlFor="rf-rende" hint="Por exemplo, 16 fatias.">
          <Input id="rf-rende" name="yieldQty" inputMode="decimal" defaultValue={rendimentoInicial} required />
        </Field>
      </div>

      <ul className="divide-y rounded-md border">
        {linhas.map((l, i) =>
          l.titulo ? (
            <li key={i} className="bg-muted/50 px-3 py-2 text-sm font-semibold">
              {l.original.replace(/:\s*$/, '')}
            </li>
          ) : (
            <li key={i} className={cn('grid gap-2 px-3 py-3 sm:grid-cols-[auto_1fr_1.3fr_8rem] sm:items-center', !l.incluir && 'opacity-60')}>
              <input type="hidden" name={`linha.${i}.original`} value={l.original} />
              <label className="flex items-center gap-2 text-sm sm:contents">
                <input
                  type="checkbox"
                  name={`linha.${i}.incluir`}
                  checked={l.incluir}
                  onChange={(e) => mudar(i, { incluir: e.target.checked })}
                  className="h-4 w-4"
                  aria-label={`Incluir "${l.original}"`}
                />
                <span className="sm:hidden">Incluir</span>
              </label>
              <p className="text-sm">
                {l.original}
                {l.incluir && l.motivo && !l.qty.trim() ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                    {l.motivo}
                  </span>
                ) : null}
              </p>
              <Select
                name={`linha.${i}.ref`}
                aria-label="Insumo"
                value={l.ref}
                onChange={(e) => mudar(i, { ref: e.target.value })}
                disabled={!l.incluir}
                className={cn(l.incluir && !l.ref && 'border-amber-500')}
              >
                <option value="">Escolha o insumo…</option>
                {(['Insumos', 'Preparações base'] as const).map((g) => (
                  <optgroup key={g} label={g}>
                    {opcoes
                      .filter((o) => o.grupo === g)
                      .map((o) => (
                        <option key={o.ref} value={o.ref}>
                          {o.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
              <div className="relative">
                <Input
                  name={`linha.${i}.qty`}
                  aria-label="Quantidade"
                  inputMode="decimal"
                  value={l.qty}
                  onChange={(e) => mudar(i, { qty: e.target.value })}
                  disabled={!l.incluir}
                  className={cn('pr-9', l.incluir && !l.qty.trim() && 'border-amber-500')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {unidadeDe.get(l.ref) ?? ''}
                </span>
              </div>
            </li>
          ),
        )}
      </ul>

      {estado.message && !estado.ok ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{estado.message}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={aEnviar}>
          {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Criar ficha técnica
        </Button>
        {porFazer ? (
          <span className="text-sm text-amber-700 dark:text-amber-400">
            {porFazer} linha{porFazer > 1 ? 's' : ''} por completar (insumo ou quantidade).
          </span>
        ) : null}
      </div>
    </form>
  );
}
