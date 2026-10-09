import { Lock, Plus } from 'lucide-react';

import { FormDialog } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { alterarUtilizador, criarUtilizador, reporPalavraPasse } from '@/lib/actions/utilizadores';
import { PERFIL_LABEL, type Perfil } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { exigirDono } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const diaFmt = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Lisbon',
});

const DESCRICAO: Record<Perfil, string> = {
  OWNER: 'Tudo: custos, encomendas, clientes, configurações e contas.',
  KITCHEN: 'O livro de receitas: ver, criar e alterar (cada alteração fica como versão). Não vê custos.',
  READER: 'O livro de receitas, só para ler e imprimir.',
  MARKETING: 'As campanhas de marketing e o guia: criar, alterar e apagar. Não vê custos, vendas, encomendas nem receitas.',
};

function CamposPerfil({ atual }: { atual?: Perfil }) {
  return (
    <Field label="Perfil" htmlFor="role" hint="Ver a descrição de cada um na página.">
      <Select id="role" name="role" defaultValue={atual ?? 'KITCHEN'}>
        {(Object.keys(PERFIL_LABEL) as Perfil[]).map((p) => (
          <option key={p} value={p}>
            {PERFIL_LABEL[p]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export default async function UtilizadoresPage() {
  const eu = await exigirDono();
  const contas = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }],
  });
  const agora = new Date();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilizadores</h1>
          <p className="text-sm text-muted-foreground">
            Quem entra, e o que pode fazer. Cada pessoa tem a sua conta — assim cada versão de
            receita fica com o nome de quem a fez.
          </p>
        </div>
        <FormDialog
          action={criarUtilizador}
          title="Nova conta"
          description="Dê uma palavra-passe provisória e diga-a à pessoa. Ela tem de a trocar no primeiro acesso."
          submitLabel="Criar conta"
          trigger={
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Nova conta
            </Button>
          }
        >
          <Field label="Nome" htmlFor="nc-nome">
            <Input id="nc-nome" name="name" required />
          </Field>
          <Field label="Nome de utilizador" htmlFor="nc-user" hint="Minúsculas, sem espaços. Ex.: ana.silva">
            <Input id="nc-user" name="username" autoCapitalize="none" required />
          </Field>
          <CamposPerfil />
          <Field label="Palavra-passe provisória" htmlFor="nc-pass" hint="Pelo menos 10 caracteres.">
            <Input id="nc-pass" name="password" autoComplete="off" required />
          </Field>
        </FormDialog>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(DESCRICAO) as Perfil[]).map((p) => (
          <div key={p} className="rounded-lg border bg-card p-3 text-sm">
            <p className="font-medium">{PERFIL_LABEL[p]}</p>
            <p className="text-muted-foreground">{DESCRICAO[p]}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contas</CardTitle>
          <CardDescription>
            Desativar ou mudar o perfil tem efeito logo: a pessoa sai na página seguinte.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {contas.map((c) => {
              const bloqueada = c.lockedUntil !== null && c.lockedUntil > agora;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={c.active ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                        {c.name}
                      </span>
                      <code className="text-xs text-muted-foreground">{c.username}</code>
                      <Badge variant={c.role === 'OWNER' ? 'default' : 'secondary'}>
                        {PERFIL_LABEL[c.role]}
                      </Badge>
                      {c.id === eu.id ? <Badge variant="outline">você</Badge> : null}
                      {!c.active ? <Badge variant="outline">desativada</Badge> : null}
                      {bloqueada ? (
                        <Badge variant="destructive">
                          <Lock className="mr-1 h-3 w-3" aria-hidden />
                          bloqueada
                        </Badge>
                      ) : null}
                      {c.mustChangePassword ? (
                        <Badge variant="warning">palavra-passe provisória</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.lastLoginAt ? `Último acesso ${diaFmt.format(c.lastLoginAt)}` : 'Ainda não entrou'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <FormDialog action={alterarUtilizador} title={`Alterar ${c.name}`}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="activeSubmitted" value="1" />
                      <Field label="Nome" htmlFor={`n-${c.id}`}>
                        <Input id={`n-${c.id}`} name="name" defaultValue={c.name} required />
                      </Field>
                      <CamposPerfil atual={c.role} />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={c.active}
                          className="h-4 w-4 rounded border-input"
                        />
                        Conta ativa
                      </label>
                    </FormDialog>
                    <FormDialog
                      action={reporPalavraPasse}
                      title={`Repor a palavra-passe de ${c.name}`}
                      description="A pessoa sai de todos os aparelhos e tem de trocar esta palavra-passe ao entrar. Também desbloqueia a conta."
                      submitLabel="Repor"
                      trigger={
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          Repor palavra-passe
                        </Button>
                      }
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Palavra-passe provisória" htmlFor={`p-${c.id}`} hint="Pelo menos 10 caracteres.">
                        <Input id={`p-${c.id}`} name="password" autoComplete="off" required />
                      </Field>
                    </FormDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
