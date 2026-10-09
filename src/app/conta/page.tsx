import { KeyRound, LogOut } from 'lucide-react';

import { ActionForm, SubmitButton } from '@/components/action-form';
import { Alert, Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { terminarOutrasSessoes, trocarPalavraPasse } from '@/lib/actions/auth';
import { PERFIL_LABEL } from '@/lib/auth';
import { exigirConta } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ trocar?: string }>;
}) {
  const eu = await exigirConta();
  const { trocar } = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">A minha conta</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {eu.name} · <code>{eu.username}</code>
          <Badge variant="secondary">{PERFIL_LABEL[eu.perfil]}</Badge>
        </p>
      </header>

      {eu.mustChangePassword || trocar ? (
        <Alert tone="warning">
          A sua palavra-passe foi dada pelo dono. Escolha uma sua antes de continuar — assim
          só você a sabe.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
            Trocar a palavra-passe
          </CardTitle>
          <CardDescription>
            Pelo menos 10 caracteres. Uma frase é mais fácil de lembrar e mais difícil de
            adivinhar: &quot;bolo de cenoura com 3 ovos&quot;. Termina as sessões noutros
            aparelhos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={trocarPalavraPasse}>
            <Field label="Palavra-passe atual" htmlFor="atual">
              <Input id="atual" name="atual" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Nova" htmlFor="nova">
              <Input id="nova" name="nova" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Repetir a nova" htmlFor="nova2">
              <Input id="nova2" name="nova2" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton>Trocar</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-primary" aria-hidden />
            Sair dos outros aparelhos
          </CardTitle>
          <CardDescription>
            Esqueceu-se de sair num telemóvel ou computador que não é seu? Isto termina todas as
            sessões menos esta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={terminarOutrasSessoes}>
            <SubmitButton variant="outline">Terminar as outras sessões</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
