'use client';

/**
 * Claro ou escuro no cardapio publico: um toque alterna e fica guardado.
 *
 * O mesmo mecanismo da app (`lib/tema.ts`): cookie `tema`, classe `dark` no
 * <html>. Ate o cliente escolher, segue o aparelho ("auto"); o botao mostra
 * o icone do tema para onde se vai.
 */

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { aplicarTema, guardarTema, type Tema } from '@/lib/tema';

export function TemaCardapio({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial);

  // Em "auto" so o browser sabe se esta escuro: le-se a classe no clique.
  const alternar = () => {
    const escuroAgora =
      tema === 'escuro' || (tema === 'auto' && document.documentElement.classList.contains('dark'));
    const novo: Tema = escuroAgora ? 'claro' : 'escuro';
    aplicarTema(novo);
    guardarTema(novo);
    setTema(novo);
  };

  return (
    <button type="button" onClick={alternar} className="ab-tema" aria-label="Alternar entre claro e escuro" title="Claro / escuro">
      {/* Os dois icones, e o CSS mostra o certo: em "auto" o servidor nao sabe o tema. */}
      <Moon className="h-5 w-5 dark:hidden" aria-hidden />
      <Sun className="hidden h-5 w-5 dark:block" aria-hidden />
    </button>
  );
}
