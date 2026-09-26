'use client';

/**
 * Limite de erro global.
 *
 * O erro mais provavel numa instalacao nova e o banco: DATABASE_URL ausente,
 * schema nao aplicado, ou o Neon a dormir. Por isso a mensagem tecnica vem
 * acompanhada do que fazer, em vez de so "algo correu mal".
 */

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const looksLikeDb =
    /prisma|database_url|connect|ECONNREFUSED|P1001|P2021|does not exist/i.test(
      error.message,
    );

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          {looksLikeDb ? 'Nao foi possivel falar com o banco de dados' : 'Algo correu mal'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {looksLikeDb ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Confirme que <code className="font-mono">DATABASE_URL</code> esta no{' '}
              <code className="font-mono">.env</code> (copie de{' '}
              <code className="font-mono">.env.example</code>).
            </li>
            <li>
              Aplique o schema: <code className="font-mono">npm run db:push</code>.
            </li>
            <li>
              Carregue os dados de exemplo:{' '}
              <code className="font-mono">npm run db:seed</code>.
            </li>
            <li>Se usa Neon no plano gratuito, a base pode estar a acordar — tente de novo.</li>
          </ol>
        ) : null}

        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
          {error.message}
        </pre>

        <Button onClick={reset} variant="outline">
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}
