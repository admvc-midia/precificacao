'use client';

/**
 * Importar insumos a partir de um CSV.
 *
 * Aceita um ficheiro ou texto colado — colar e o caminho mais curto quando os
 * dados ja estao numa folha de calculo aberta, que e o caso normal.
 *
 * As linhas recusadas ficam a vista com o numero da linha. Uma importacao de
 * oitenta insumos em que tres falham tem de dizer **quais**, ou a pessoa fica
 * sem saber o que falta conferir.
 */

import { useActionState, useState } from 'react';

import { SubmitButton } from '@/components/action-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Textarea } from '@/components/ui/input';
import type { ImportState } from '@/lib/actions/import';

const EXEMPLO = [
  'nome;preco;quantidade;unidade;fornecedor;categoria;perda',
  'Carne picada 20%;12,50;5;KG;Talho do Bairro;alimento;0',
  'Alcatra;18,00;1;KG;Talho do Bairro;alimento;20',
  'Caixa de hamburguer;12,00;100;UN;Makro;embalagem;',
].join('\n');

const INICIAL: ImportState = { ok: true };

export function CsvImport({
  action,
  trigger,
}: {
  action: (state: ImportState, form: FormData) => Promise<ImportState>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [state, formAction] = useActionState(action, INICIAL);

  async function lerFicheiro(file: File | undefined) {
    if (!file) return;
    setTexto(await file.text());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar insumos de um CSV</DialogTitle>
          <DialogDescription>
            Obrigatorias: <strong>nome</strong>, <strong>preco</strong> e{' '}
            <strong>quantidade</strong>. Opcionais: unidade, fornecedor, categoria,
            perda (em %) e estoque. Um insumo com o mesmo nome e fornecedor e
            atualizado, nunca duplicado.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <Field label="Ficheiro" htmlFor="csv-file">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => lerFicheiro(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </Field>

          <Field
            label="Ou cole aqui"
            htmlFor="csv-text"
            hint="O que estiver aqui e o que sera importado."
          >
            <Textarea
              id="csv-text"
              name="csv"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={EXEMPLO}
            />
          </Field>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTexto(EXEMPLO)}
          >
            Preencher com um exemplo
          </Button>

          {state.message ? (
            <p
              role="status"
              className={
                state.ok
                  ? 'rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
              }
            >
              {state.message}
            </p>
          ) : null}

          {state.rejeitadas && state.rejeitadas.length > 0 ? (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Linhas que ficaram de fora</p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {state.rejeitadas.map((r) => (
                  <li key={`${r.line}-${r.reason}`}>
                    <span className="tabular-nums">linha {r.line}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <SubmitButton pendingLabel="A importar…">Importar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
