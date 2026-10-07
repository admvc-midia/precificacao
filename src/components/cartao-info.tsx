/**
 * Cartao compacto de informacao: icone e titulo pequenos em cima, o lapis de
 * editar a direita, o conteudo por baixo. Usado na encomenda (cliente,
 * entrega, pagamento) e na ficha do cliente.
 */

import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

export function CartaoInfo({
  icon: Icon,
  titulo,
  editar,
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  editar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="-mt-1 flex min-h-9 items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {titulo}
          </span>
          <span className="-mr-2">{editar}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
