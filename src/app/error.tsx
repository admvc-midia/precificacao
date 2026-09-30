'use client';

/**
 * Limite de erro global.
 *
 * O erro mais provavel numa instalacao nova e o banco: DATABASE_URL ausente,
 * schema nao aplicado, porta errada do pooler, ou a base a dormir. Por isso a
 * mensagem tecnica vem acompanhada do que fazer, em vez de so "algo correu
 * mal".
 *
 * **Em producao o React esconde a mensagem** e deixa so um numero de erro
 * generico — a verdadeira fica no servidor. O que atravessa e o `digest`, e e
 * por ele que se encontra a linha certa nos logs. Sem o mostrar aqui, quem ve
 * o erro nao tem por onde comecar.
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

  const pareceBanco =
    /prisma|database_url|connect|ECONNREFUSED|P1001|P2021|does not exist/i.test(
      error.message,
    );

  // Em producao a mensagem chega minificada e nao diz nada. Mas um `digest`
  // significa que o erro **veio do servidor** e que o texto ficou la — e o
  // servidor, nesta aplicacao, e quase sempre o banco. Mostrar a lista de
  // verificacao vale mais do que um "algo correu mal" sozinho.
  const mostrarPistas = pareceBanco || Boolean(error.digest);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          {pareceBanco
            ? 'Nao foi possivel falar com o banco de dados'
            : error.digest
              ? 'O servidor nao conseguiu montar esta pagina'
              : 'Algo correu mal'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mostrarPistas ? (
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
            <li>
              Em serverless, a <code className="font-mono">DATABASE_URL</code>{' '}
              tem de usar o pooler em modo transacao — no Supabase, a porta{' '}
              <code className="font-mono">6543</code> com{' '}
              <code className="font-mono">pgbouncer=true&amp;connection_limit=1</code>.
              A porta 5432 e modo sessao e esgota as ligacoes.
            </li>
            <li>Se a base e gratuita, pode estar a acordar — tente de novo.</li>
          </ol>
        ) : null}

        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
          {error.message}
        </pre>

        {error.digest ? (
          <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              A mensagem verdadeira ficou no servidor. Procure-a nos registos
              pela referencia:
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">{error.digest}</p>
            <p className="mt-2">
              Na Vercel: o projeto → <strong>Logs</strong> → procurar por esta
              referencia.
            </p>
          </div>
        ) : null}

        <Button onClick={reset} variant="outline">
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}
