/**
 * As redes sociais do cliente, como botoes que abrem o perfil numa aba nova.
 * So o dono os ve: sao dados pessoais, como o telefone.
 */

import { Facebook, Instagram, Music2 } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { linkRede, mostrarRede, REDE_LABEL, type Rede } from '@/lib/pricing/clientes';
import { cn } from '@/lib/utils';

/** O TikTok nao tem icone no lucide; a nota musical e o que mais se parece. */
const ICONE: Record<Rede, typeof Instagram> = { instagram: Instagram, facebook: Facebook, tiktok: Music2 };

export function RedesCliente({
  cliente,
  className,
}: {
  cliente: { instagram?: string | null; facebook?: string | null; tiktok?: string | null };
  className?: string;
}) {
  const redes = (['instagram', 'facebook', 'tiktok'] as const).filter((r) => cliente[r]);
  if (redes.length === 0) return null;
  return (
    <span className={cn('flex flex-wrap gap-2', className)}>
      {redes.map((r) => {
        const Icone = ICONE[r];
        return (
          <a
            key={r}
            href={linkRede(r, cliente[r]!)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir no ${REDE_LABEL[r]}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-1.5 px-2.5')}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{REDE_LABEL[r]}: </span>
            {mostrarRede(r, cliente[r]!)}
          </a>
        );
      })}
    </span>
  );
}
