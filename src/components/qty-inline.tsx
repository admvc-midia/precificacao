'use client';

/**
 * A quantidade de uma linha da ficha, editavel no proprio sitio.
 *
 * Mostra "0,395 kg"; um clique troca por um campo ja preenchido. Enter ou
 * sair do campo grava, Esc desiste. Abrir uma janela para mudar um numero era
 * o passo que mais se repetia ao afinar uma receita.
 *
 * So manda a quantidade e a unidade. As notas nao vao, de proposito, e a
 * action deixa-as como estao quando o campo nao vem (ver `updateRecipeItem`).
 *
 * Se a action recusar, o campo fica aberto com o que foi escrito e a mensagem
 * por baixo — perder o que se escreveu por causa de um erro e o pior dos dois
 * mundos.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Pencil } from 'lucide-react';

import { QtyInput } from '@/components/ui/qty-input';
import { updateRecipeItem } from '@/lib/actions/recipes';
import { cn } from '@/lib/utils';

export interface QtyInlineProps {
  /** Id da linha da ficha (RecipeItem). */
  itemId: string;
  /** Nome do item, para o leitor de ecra saber o que se esta a editar. */
  itemName: string;
  /** Como se le fora de edicao: "0,395 kg". */
  display: string;
  /** O numero que o campo traz ao abrir: "0,395". */
  value: string;
  /** "kg" ou "un", dentro do campo. */
  unitLabel: string;
  /** "KG" ou "UN", como a action espera. */
  unitValue: string;
  className?: string;
}

export function QtyInline({
  itemId,
  itemName,
  display,
  value,
  unitLabel,
  unitValue,
  className,
}: QtyInlineProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(value);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  // Enter grava e fecha o campo, e fechar tira-lhe o foco — sem isto o blur
  // mandava a mesma gravacao uma segunda vez.
  const aGravar = useRef(false);

  useEffect(() => {
    if (editando) input.current?.select();
  }, [editando]);

  // Depois de um erro, o foco volta ao campo — so quando ele ja reativou,
  // porque durante a gravacao esta desativado e o focus nao pegaria.
  useEffect(() => {
    if (editando && erro && !pendente) input.current?.focus();
  }, [editando, erro, pendente]);

  // O rascunho copia o valor ao abrir, e so ai: fechado, o que se ve e sempre
  // o que o servidor devolveu.
  function abrir() {
    setErro(null);
    setRascunho(value);
    setEditando(true);
  }

  function desistir() {
    setErro(null);
    setRascunho(value);
    setEditando(false);
  }

  function gravar() {
    if (aGravar.current) return;
    // Nada mudou: fechar sem ir ao servidor.
    if (rascunho.trim() === value.trim()) {
      desistir();
      return;
    }
    aGravar.current = true;
    const form = new FormData();
    form.set('id', itemId);
    form.set('qty', rascunho);
    form.set('unit', unitValue);

    startTransition(async () => {
      const r = await updateRecipeItem({ ok: true }, form);
      aGravar.current = false;
      if (r.ok) {
        setErro(null);
        setEditando(false);
      } else {
        setErro(r.message ?? 'Nao foi possivel gravar.');
      }
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={abrir}
        title="Clique para alterar a quantidade"
        aria-label={`Alterar a quantidade de ${itemName}: ${display}`}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 tabular-nums outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Pencil
          className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
        {display}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        gravar();
      }}
      className={cn('inline-block w-36 text-left', className)}
    >
      <div className="relative">
        <QtyInput
          ref={input}
          aria-label={`Quantidade de ${itemName}`}
          aria-invalid={erro ? true : undefined}
          unitLabel={unitLabel}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={gravar}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              desistir();
            }
          }}
          disabled={pendente}
          className={cn('h-8', erro && 'border-destructive focus-visible:ring-destructive')}
        />
        {pendente ? (
          <Loader2
            className="absolute -left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-label="A gravar"
          />
        ) : null}
      </div>
      {erro ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </form>
  );
}
