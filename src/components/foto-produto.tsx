'use client';

/**
 * A foto de uma ficha (ou de uma receita do livro): mostrar, pôr, trocar, tirar.
 *
 * A foto e reduzida **aqui**, no telemovel, antes de sair: uma foto de
 * telemovel tem 3 a 5 MB, e reduzida a 1600 px em JPEG fica com 200 a 400 KB.
 * Envia mais depressa na rede da cozinha, gasta menos armazenamento, e cabe no
 * limite das actions sem o alargar. A miniatura das listas (320 px) sai do
 * mesmo desenho, para as listas nao carregarem a foto grande.
 *
 * `imageOrientation: 'from-image'` respeita a rotacao que a camara grava nos
 * metadados — sem isso, as fotos tiradas ao alto chegavam deitadas.
 */

import { useRef, useState, useTransition } from 'react';
import { Camera, ImageOff, Loader2, Trash2 } from 'lucide-react';

import { ConfirmDelete, type ActionFn } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { removeRecipePhoto, saveRecipePhoto } from '@/lib/actions/photos';
import { cn } from '@/lib/utils';

const LADO_FOTO = 1600;
const LADO_MINI = 320;

async function reduzir(bmp: ImageBitmap, lado: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este browser nao consegue preparar a foto.');
  // Fundo branco: um PNG com transparencia viraria preto em JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Nao foi possivel preparar a foto.'))),
      'image/jpeg',
      qualidade,
    ),
  );
}

export function FotoProduto({
  recipeId,
  nome,
  src,
  guardar = saveRecipePhoto,
  remover = removeRecipePhoto,
  podeEditar = true,
}: {
  recipeId: string;
  nome: string;
  /** `fotoSrc(...)` da foto grande, ou `null` sem foto. */
  src: string | null;
  /** As actions — as das fichas por omissao; o livro passa as suas. */
  guardar?: ActionFn;
  remover?: ActionFn;
  /** Sem permissao, so se mostra a foto. */
  podeEditar?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, startTransition] = useTransition();
  const [aPreparar, setAPreparar] = useState(false);
  const ocupado = aEnviar || aPreparar;

  async function escolher(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setErro(null);
    setAPreparar(true);
    let foto: Blob;
    let mini: Blob;
    try {
      const bmp = await createImageBitmap(ficheiro, { imageOrientation: 'from-image' });
      try {
        [foto, mini] = await Promise.all([reduzir(bmp, LADO_FOTO, 0.82), reduzir(bmp, LADO_MINI, 0.8)]);
      } finally {
        bmp.close();
      }
    } catch {
      setErro('Nao consegui abrir essa imagem. Experimente uma foto JPEG ou PNG.');
      setAPreparar(false);
      return;
    } finally {
      // O mesmo ficheiro escolhido outra vez tem de voltar a disparar.
      if (input.current) input.current.value = '';
    }
    setAPreparar(false);

    const f = new FormData();
    f.set('id', recipeId);
    f.set('foto', foto, 'foto.jpg');
    f.set('mini', mini, 'mini.jpg');
    startTransition(async () => {
      const r = await guardar({ ok: true }, f);
      if (!r.ok) setErro(r.message ?? 'Nao foi possivel guardar a foto.');
    });
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-lg border bg-muted/40',
          ocupado && 'opacity-60',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a foto vem de uma rota com sessao; o otimizador do next/image pede-a sem cookie e levaria a pagina de entrada
          <img src={src} alt={`Foto de ${nome}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden />
            Sem foto
          </span>
        )}
        {ocupado ? (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {aPreparar ? 'A preparar…' : 'A enviar…'}
          </span>
        ) : null}
      </div>

      {podeEditar ? (
      <div className="flex flex-wrap items-center gap-2">
        {/* Sem `capture`: no telemovel o sistema oferece camara e galeria. */}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          id={`foto-${recipeId}`}
          onChange={(e) => escolher(e.target.files?.[0])}
          disabled={ocupado}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={ocupado}
        >
          <Camera className="h-4 w-4" />
          {src ? 'Trocar foto' : 'Adicionar foto'}
        </Button>
        {src ? (
          <ConfirmDelete
            action={remover}
            fields={{ id: recipeId }}
            title="Remover a foto?"
            description="Fica sem foto. Pode por outra quando quiser."
            confirmLabel="Remover foto"
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={ocupado}>
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            }
          />
        ) : null}
      </div>
      ) : null}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
