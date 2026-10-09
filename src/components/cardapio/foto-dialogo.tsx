'use client';

/**
 * O botao da camara num item ou numa secao do cardapio: abre uma janela com
 * a foto (pôr, trocar, tirar). Janela a parte, e nao dentro do lapis, porque
 * o `FotoProduto` tem formularios seus — e um formulario nao pode estar dentro
 * de outro.
 */

import { Camera, ImagePlus } from 'lucide-react';

import type { ActionFn } from '@/components/action-form';
import { FotoProduto } from '@/components/foto-produto';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function FotoDialogo({
  id,
  nome,
  src,
  herdada,
  guardar,
  remover,
}: {
  id: string;
  nome: string;
  /** A foto propria, ou `null`. */
  src: string | null;
  /** Sem foto propria, a que aparece no link vem da ficha. */
  herdada?: boolean;
  guardar: ActionFn;
  remover: ActionFn;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          title={src ? 'Trocar a foto' : 'Pôr foto'}
        >
          {src ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
          <span className="sr-only">Foto</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Foto · {nome}</DialogTitle>
          <DialogDescription>
            Aparece no link público. Uma foto ao alto ou quadrada, com luz natural, fica melhor.
            {herdada ? ' Sem foto aqui, o link usa a da ficha técnica.' : ''}
          </DialogDescription>
        </DialogHeader>
        <FotoProduto recipeId={id} nome={nome} src={src} guardar={guardar} remover={remover} />
      </DialogContent>
    </Dialog>
  );
}
