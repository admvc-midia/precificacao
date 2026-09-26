'use client';

/**
 * Formulario ligado a uma Server Action, com estado de envio e mensagem.
 *
 * Porque existe: sem isto, cada pagina repetiria o mesmo `useActionState` e o
 * mesmo bloco de mensagem. O formulario continua a ser um `<form>` nativo —
 * se o JavaScript nao carregar, ele submete a mesma action a moda antiga e a
 * pagina recarrega; so a mensagem em linha e que se perde.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ActionState {
  ok: boolean;
  message?: string;
}

const INITIAL: ActionState = { ok: true };

export function ActionForm({
  action,
  children,
  className,
  /** Mostra a mensagem de sucesso. Desligue em formularios de remocao em lista. */
  showSuccess = true,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className={cn('space-y-4', className)}>
      {children}
      {state.message && (!state.ok || showSuccess) ? (
        <p
          role="status"
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            state.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
          )}
        >
          {state.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}

/** Botao que se desativa e mostra progresso enquanto a action corre. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {pendingLabel ?? 'A guardar…'}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Botao de remocao com confirmacao. Confirmar no cliente e suficiente aqui:
 * a action do servidor ja recusa remover o que esta em uso.
 */
export function DeleteButton({
  children = 'Remover',
  confirmMessage = 'Tem a certeza?',
  ...props
}: ButtonProps & { confirmMessage?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
      className="text-muted-foreground hover:text-destructive"
      {...props}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </Button>
  );
}
