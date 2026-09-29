'use client';

/**
 * Ver a ficha tecnica sem sair da precificacao.
 *
 * O link levava para outra pagina, e voltar perdia o preco que se estava a
 * testar. Aqui a ficha abre por cima, confere-se, fecha-se, e o campo de
 * preco continua onde estava.
 *
 * E so para **ver**. Editar continua a ter pagina propria — uma ficha inteira
 * numa janela fica apertada, e a pagina pode ser partilhada, impressa e aberta
 * num separador.
 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface QuickViewLine {
  id: string;
  name: string;
  detail: string;
  qty: string;
  cost: string;
}

export function RecipeQuickView({
  recipeId,
  recipeName,
  yieldLabel,
  packagingLabel,
  lines,
  totalLabel,
  trigger,
}: {
  recipeId: string;
  recipeName: string;
  yieldLabel: string;
  packagingLabel: string | null;
  lines: QuickViewLine[];
  totalLabel: string;
  trigger: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{recipeName}</DialogTitle>
          <DialogDescription>
            Rende {yieldLabel}
            {packagingLabel ? ` · ${packagingLabel}` : ''}. Quantidades do lote
            inteiro, como estao escritas na ficha.
          </DialogDescription>
        </DialogHeader>

        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Esta ficha ainda nao tem composicao.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums">{l.qty}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{l.cost}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-baseline justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Custo do lote</span>
          <span className="tabular-nums font-semibold">{totalLabel}</span>
        </p>

        <DialogFooter>
          <Button asChild variant="outline">
            <Link href={`/fichas/${recipeId}`}>
              <ExternalLink className="h-4 w-4" />
              Abrir para editar
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
