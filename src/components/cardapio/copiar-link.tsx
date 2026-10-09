'use client';

/** O link publico com um botao de copiar (para a bio do Instagram). */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="break-all rounded-md bg-muted px-2 py-1 text-sm">{url}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            // Sem acesso a area de transferencia (http, browser antigo): o
            // link esta a vista para copiar a mao.
          }
        }}
      >
        {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copiado ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}
