'use client';

/**
 * Formularios ligados a Server Actions.
 *
 * `ActionForm` e o formulario simples de pagina. `FormDialog` e o mesmo
 * formulario dentro de uma janela, para editar um registo sem perder a lista
 * de vista. `ConfirmDelete` e a confirmacao de remocao.
 *
 * Detalhe que decide o desenho das duas janelas: elas sao **controladas** e
 * so fecham quando a action devolve sucesso. Se fechassem ao clicar, uma
 * recusa do servidor — "este insumo e usado em 3 fichas tecnicas" — sumia
 * antes de ser lida, e o utilizador ficava sem perceber porque nada
 * aconteceu.
 */

import { createContext, use, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, Pencil, Trash2, XCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ActionState {
  ok: boolean;
  message?: string;
  /** Nomes existentes parecidos, quando a action quer confirmar antes de criar. */
  similar?: string[];
}

/**
 * O estado da action, disponivel aos campos do formulario.
 *
 * Existe porque os campos sao criados no servidor e passados como filhos:
 * nao ha como lhes dar o estado por prop. Como sao componentes de cliente,
 * podem ler um contexto que o formulario a volta deles fornece — e e assim
 * que o formulario de insumo sabe que o servidor encontrou um nome parecido.
 */
const EstadoDaAction = createContext<ActionState>({ ok: true });

export function useActionFormState(): ActionState {
  return use(EstadoDaAction);
}

export type ActionFn = (state: ActionState, form: FormData) => Promise<ActionState>;

const INITIAL: ActionState = { ok: true };

/** A action correu e correu bem (o estado inicial nao tem mensagem). */
function succeeded(state: ActionState): boolean {
  return state.ok && Boolean(state.message);
}

/**
 * Fecha a janela quando a action devolve sucesso.
 *
 * Ajusta o estado **durante o render**, comparando com o estado ja visto, em
 * vez de o fazer num `useEffect`. E o padrao que o React recomenda para
 * reagir a uma mudanca de estado: um efeito aqui provocaria um render em
 * cascata a cada submissao.
 */
function useFecharAoConseguir(
  state: ActionState,
  setOpen: (aberto: boolean) => void,
): void {
  const [visto, setVisto] = useState(state);
  if (state !== visto) {
    setVisto(state);
    if (succeeded(state)) setOpen(false);
  }
}

// ---------------------------------------------------------------------------
// Formulario de pagina
// ---------------------------------------------------------------------------

export function ActionForm({
  action,
  children,
  className,
  /** Desligue em formularios de remocao em lista, onde o "ok" so faz ruido. */
  showSuccess = true,
}: {
  action: ActionFn;
  children: React.ReactNode;
  className?: string;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className={cn('space-y-4', className)}>
      <EstadoDaAction.Provider value={state}>{children}</EstadoDaAction.Provider>
      <FormMessage state={state} showSuccess={showSuccess} />
    </form>
  );
}

function FormMessage({
  state,
  showSuccess = true,
}: {
  state: ActionState;
  showSuccess?: boolean;
}) {
  if (!state.message || (state.ok && !showSuccess)) return null;

  return (
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
  );
}

// ---------------------------------------------------------------------------
// Formulario em janela
// ---------------------------------------------------------------------------

export function FormDialog({
  action,
  title,
  description,
  trigger,
  children,
  submitLabel = 'Guardar',
  className,
}: {
  action: ActionFn;
  title: string;
  description?: string;
  /** Se nao passar, aparece um botao de lapis. */
  trigger?: React.ReactNode;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, INITIAL);
  useFecharAoConseguir(state, setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <EstadoDaAction.Provider value={state}>{children}</EstadoDaAction.Provider>
          {/* So o erro aparece aqui: o sucesso fecha a janela, e a lista
              atras ja mostra o valor novo. */}
          <FormMessage state={state} showSuccess={false} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirmacao de remocao
// ---------------------------------------------------------------------------

export function ConfirmDelete({
  action,
  fields,
  title = 'Remover?',
  description,
  confirmLabel = 'Remover',
  trigger,
}: {
  action: ActionFn;
  /** Campos escondidos enviados a action, normalmente `{ id }`. */
  fields: Record<string, string>;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, INITIAL);
  useFecharAoConseguir(state, setOpen);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Remover</span>
          </Button>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <FormMessage state={state} showSuccess={false} />

          <AlertDialogFooter>
            {/* Botao normal, nao o AlertDialogAction do Radix: aquele fecha
                a janela ao clicar, e a recusa do servidor perdia-se. */}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <DestructiveSubmit>{confirmLabel}</DestructiveSubmit>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Botoes
// ---------------------------------------------------------------------------

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

function DestructiveSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonVariants({ variant: 'destructive' }))}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          A remover…
        </>
      ) : (
        children
      )}
    </button>
  );
}
