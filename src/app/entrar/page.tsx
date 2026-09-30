/**
 * A porta.
 *
 * Tambem e aqui que se explica o que falta, quando `APP_PASSWORD` nao esta
 * definida — em vez de uma pagina de erro sem saida. Quem publica isto e a
 * mesma pessoa que o usa, e uma instrucao concreta poupa-lhe a caca ao
 * ficheiro certo.
 */

import Image from 'next/image';
import { ShieldAlert } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { Alert } from '@/components/ui/badge';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { entrar } from '@/lib/actions/auth';
import { protegida } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  const { de } = await searchParams;
  const configurada = protegida();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      {/* A estampa em cheio, so aqui: e a porta da casa. Por tras de tudo,
          por cima da versao apagada que as outras paginas tem. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[image:var(--estampa)] bg-[length:360px_318px]"
      />

      <div className="rounded-xl border bg-card p-6 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          {/* Vinho no cartao creme, creme no cartao escuro. */}
          <Image
            src="/logo-vinho.png"
            alt="Amo Brigs"
            width={1200}
            height={342}
            priority
            className="mx-auto h-14 w-auto dark:hidden"
          />
          <Image
            src="/logo-creme.png"
            alt="Amo Brigs"
            width={1200}
            height={342}
            priority
            className="mx-auto hidden h-14 w-auto dark:block"
          />
          <p className="mt-3 font-titulo text-lg text-muted-foreground">Precificação</p>
        </div>

        {configurada ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Esta aplicacao tem os custos e os precos da casa. Escreva a palavra-passe
              para continuar.
            </p>

            <ActionForm action={entrar} showSuccess={false}>
              {de ? <input type="hidden" name="de" value={de} /> : null}
              <Field label="Palavra-passe" htmlFor="password">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </Field>
              <SubmitButton className="w-full" pendingLabel="A entrar…">
                Entrar
              </SubmitButton>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Fica ligado neste aparelho durante 30 dias.
            </p>
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Falta definir a palavra-passe
            </h1>

            <Alert tone="warning" className="mt-4">
              Enquanto a variavel <code>APP_PASSWORD</code> nao estiver definida, ninguem
              entra. E de proposito: uma aplicacao com os seus custos e margens nao deve
              ficar aberta a quem apanhe o link.
            </Alert>

            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Na Vercel:</strong> Settings →
                Environment Variables → nome <code>APP_PASSWORD</code>, valor a
                palavra-passe que quiser. Depois é preciso publicar de novo para ela
                entrar em vigor.
              </p>
              <p>
                <strong className="text-foreground">No seu computador:</strong> acrescente
                a linha <code>APP_PASSWORD=...</code> ao ficheiro <code>.env</code> e
                reinicie o servidor.
              </p>
              <p>
                Trocar a palavra-passe mais tarde faz sair toda a gente, o que e o que se
                quer quando se troca uma palavra-passe.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
