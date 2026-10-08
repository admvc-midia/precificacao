/**
 * A porta.
 *
 * Tres estados: falta a APP_PASSWORD (explica-se o que configurar), ainda nao
 * ha contas (cria-se a primeira, de dono, com a APP_PASSWORD como prova), ou
 * entra-se com utilizador e palavra-passe.
 */

import Image from 'next/image';
import { ShieldAlert } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { Alert } from '@/components/ui/badge';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { criarPrimeiroDono, entrar } from '@/lib/actions/auth';
import { protegida } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; motivo?: string }>;
}) {
  const { de, motivo } = await searchParams;
  const configurada = protegida();
  const semContas = configurada && (await prisma.user.count()) === 0;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      {/* A estampa em cheio, so aqui: e a porta da casa. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-(image:--estampa) bg-size-[360px_318px]"
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
          <p className="mt-3 font-titulo text-lg text-muted-foreground">Ateliê</p>
        </div>

        {!configurada ? (
          <SemConfiguracao />
        ) : semContas ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Criar a conta de dono</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Ainda não há contas. A primeira é a do dono, que depois cria as das cozinheiras.
              Para provar que é quem publicou a app, escreva a palavra-passe da aplicação
              (<code>APP_PASSWORD</code>).
            </p>
            <ActionForm action={criarPrimeiroDono} showSuccess={false}>
              <Field label="Palavra-passe da aplicação" htmlFor="appPassword">
                <Input id="appPassword" name="appPassword" type="password" required autoFocus />
              </Field>
              <Field label="O seu nome" htmlFor="name">
                <Input id="name" name="name" autoComplete="name" required />
              </Field>
              <Field label="Nome de utilizador" htmlFor="username" hint="Minúsculas, sem espaços. Ex.: ana.silva">
                <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
              </Field>
              <Field label="Palavra-passe nova" htmlFor="password" hint="Pelo menos 10 caracteres.">
                <Input id="password" name="password" type="password" autoComplete="new-password" required />
              </Field>
              <Field label="Repetir a palavra-passe" htmlFor="password2">
                <Input id="password2" name="password2" type="password" autoComplete="new-password" required />
              </Field>
              <SubmitButton className="w-full" pendingLabel="A criar…">
                Criar conta e entrar
              </SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
            {motivo === 'sessao' ? (
              <Alert tone="info" className="mt-3">
                A sessão terminou (a conta foi alterada ou a palavra-passe trocada). Entre outra
                vez.
              </Alert>
            ) : (
              <p className="mb-5 mt-1 text-sm text-muted-foreground">
                Esta aplicação tem os custos, os preços e as receitas da casa.
              </p>
            )}

            <ActionForm action={entrar} showSuccess={false} className="mt-4 space-y-4">
              {de ? <input type="hidden" name="de" value={de} /> : null}
              <Field label="Utilizador" htmlFor="username">
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Palavra-passe" htmlFor="password">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="lembrar" className="mt-0.5 h-4 w-4 rounded border-input" />
                <span>
                  Manter a sessão neste aparelho
                  <span className="block text-xs text-muted-foreground">
                    30 dias em vez de 12 horas. Só no seu telemóvel ou computador — nunca num
                    aparelho partilhado.
                  </span>
                </span>
              </label>
              <SubmitButton className="w-full" pendingLabel="A entrar…">
                Entrar
              </SubmitButton>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Esqueceu-se da palavra-passe? Peça ao dono que a reponha.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SemConfiguracao() {
  return (
    <>
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        Falta configurar a segurança
      </h1>

      <Alert tone="warning" className="mt-4">
        Enquanto as variáveis <code>APP_PASSWORD</code> e <code>SESSION_SECRET</code> não
        estiverem definidas, ninguém entra. É de propósito: uma aplicação com os seus custos e
        margens não deve ficar aberta a quem apanhe o link.
      </Alert>

      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
        <p>
          <code>APP_PASSWORD</code>: uma frase longa, que se pede só para criar a primeira
          conta de dono.
        </p>
        <p>
          <code>SESSION_SECRET</code>: pelo menos 32 caracteres aleatórios — assina as sessões.
          Gere-a com <code>npx tsx tools/novo-segredo.mts</code>, nunca a escreva à mão. Trocá-la
          faz sair toda a gente.
        </p>
        <p>
          <strong className="text-foreground">Na Vercel:</strong> Settings → Environment
          Variables, as duas no ambiente de Produção, e publicar de novo.{' '}
          <strong className="text-foreground">No computador:</strong> no ficheiro{' '}
          <code>.env</code>, e reiniciar o servidor.
        </p>
      </div>
    </>
  );
}
