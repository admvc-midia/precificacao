/**
 * A miniatura da foto de um produto, para as listas. Sem foto, um quadrado
 * com a inicial — as linhas ficam alinhadas com ou sem fotos.
 *
 * `<img>` e nao `next/image`: a foto vem de uma rota com sessao, e o
 * otimizador do Next pedi-la-ia sem o cookie (e receberia a pagina de entrada).
 */

import { fotoSrc } from '@/lib/foto-url';
import { cn } from '@/lib/utils';

export function Miniatura({
  recipeId,
  nome,
  caminho,
  className,
}: {
  recipeId: string;
  nome: string;
  caminho: string | null | undefined;
  className?: string;
}) {
  const src = fotoSrc(recipeId, caminho, 'mini');
  const base = cn('h-9 w-9 shrink-0 rounded-md', className);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- ver o comentario do ficheiro
    <img src={src} alt="" loading="lazy" className={cn(base, 'border object-cover')} />
  ) : (
    <span
      aria-hidden
      className={cn(base, 'flex items-center justify-center bg-muted font-titulo text-base text-muted-foreground')}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}
