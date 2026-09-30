'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Abre o dialogo de impressao do sistema.
 *
 * Cliente por uma razao so: `window.print()`. E de proposito que nao ha aqui
 * geracao de PDF — o dialogo do sistema ja tem "Guardar como PDF", toda a
 * gente sabe usa-lo, e uma biblioteca de PDF traria megabytes e uma segunda
 * maneira de a folha ficar diferente do que se ve no ecra.
 */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Imprimir
    </Button>
  );
}
