'use client';

/**
 * Na Ajuda, quem chega por `/ajuda#fichas` quer ver a secao das fichas ja
 * aberta — nao um titulo fechado que ainda tem de encontrar e clicar.
 * Alguns browsers abrem o <details> sozinhos ao seguir o link, outros nao.
 */

import { useEffect } from 'react';

export function AbrirSecaoDoLink() {
  useEffect(() => {
    function abrir() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: 'start' });
      }
    }
    abrir();
    window.addEventListener('hashchange', abrir);
    return () => window.removeEventListener('hashchange', abrir);
  }, []);

  return null;
}
