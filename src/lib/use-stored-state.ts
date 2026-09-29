'use client';

/**
 * Estado guardado no browser deste utilizador.
 *
 * Serve o que e conveniencia de quem esta a ver — uma seccao que ficou
 * fechada, os itens ja riscados na lista de compras — e nunca dados do
 * negocio, que vivem no servidor.
 *
 * ---------------------------------------------------------------------------
 * PORQUE `useSyncExternalStore` E NAO UM `useEffect`
 * ---------------------------------------------------------------------------
 * O instinto e ler o `localStorage` num efeito e chamar `setState`. Funciona,
 * mas provoca um render em cascata a cada montagem, e o React desaconselha-o.
 *
 * `useSyncExternalStore` foi feito para isto: tem um retrato separado para o
 * servidor (onde nao ha `localStorage`), o que evita o desencontro entre a
 * marcacao do servidor e a do cliente sem precisar de um segundo render.
 *
 * Tudo aqui tolera falhar: em janela privada ou com dados de site bloqueados,
 * o `localStorage` lanca excecao. Por isso ha uma copia em memoria que serve
 * de cache de leitura e de rede de seguranca — a escolha continua a funcionar
 * nesta sessao, so nao sobrevive a um recarregamento.
 *
 * Uma chave com o prefixo `mem:` nunca toca no armazenamento: serve o caso em
 * que o estado e util mas nao vale a pena lembrar entre visitas.
 */

import { useCallback, useSyncExternalStore } from 'react';

const EVENTO = 'precificaragao:stored-state';

/** Cache de leitura e alternativa quando o armazenamento nao esta disponivel. */
const memoria = new Map<string, string>();

function persistente(chave: string): boolean {
  return Boolean(chave) && !chave.startsWith('mem:');
}

function ler(chave: string): string | null {
  if (memoria.has(chave)) return memoria.get(chave)!;
  if (!persistente(chave)) return null;
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function escrever(chave: string, valor: string): void {
  memoria.set(chave, valor);
  if (!persistente(chave)) return;
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    /* fica so em memoria nesta sessao */
  }
}

function subscrever(callback: () => void): () => void {
  // `storage` cobre outras abas; o evento proprio cobre esta.
  window.addEventListener('storage', callback);
  window.addEventListener(EVENTO, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENTO, callback);
  };
}

export function useStoredString(
  chave: string,
  omissao: string,
): [string, (valor: string) => void] {
  const snapshot = useCallback(() => ler(chave) ?? omissao, [chave, omissao]);

  // No servidor nao ha armazenamento: devolve sempre o valor por omissao,
  // que e o que a marcacao inicial tem de refletir.
  const noServidor = useCallback(() => omissao, [omissao]);

  const valor = useSyncExternalStore(subscrever, snapshot, noServidor);

  const guardar = useCallback(
    (novo: string) => {
      escrever(chave, novo);
      window.dispatchEvent(new Event(EVENTO));
    },
    [chave],
  );

  return [valor, guardar];
}
