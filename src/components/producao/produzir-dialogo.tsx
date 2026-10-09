/**
 * O botao "Produzir" da ficha tecnica e do livro de receitas: pergunta
 * quantas e para quando, cria a ordem de producao so com este produto e
 * abre-a (`produzirFicha`).
 */

import { Factory } from 'lucide-react';

import { FormDialog } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { produzirFicha } from '@/lib/actions/production';
import { diaEmLisboa } from '@/lib/datas';

export function ProduzirDialogo({ recipeId, nome }: { recipeId: string; nome: string }) {
  return (
    <FormDialog
      action={produzirFicha}
      title={`Produzir ${nome}`}
      description="Cria uma ordem de produção só com este produto e abre-a: lá vê o que falta comprar e regista a produção."
      submitLabel="Criar ordem"
      trigger={
        <Button variant="outline" size="sm">
          <Factory className="h-4 w-4" />
          Produzir
        </Button>
      }
    >
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantas" htmlFor={`prod-q-${recipeId}`} hint="Unidades ou porções da ficha.">
          <Input id={`prod-q-${recipeId}`} name="qty" inputMode="decimal" defaultValue="1" required />
        </Field>
        <Field label="Para quando" htmlFor={`prod-d-${recipeId}`}>
          <Input id={`prod-d-${recipeId}`} name="dueAt" type="date" defaultValue={diaEmLisboa(new Date())} />
        </Field>
      </div>
      <Field label="Notas" htmlFor={`prod-n-${recipeId}`}>
        <Textarea id={`prod-n-${recipeId}`} name="notes" rows={2} placeholder="Para a feira de sábado" />
      </Field>
    </FormDialog>
  );
}
