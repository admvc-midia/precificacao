/**
 * Tema claro, escuro, ou o do aparelho.
 *
 * A escolha vive num cookie e nao numa conta: nao ha contas, e faz sentido
 * que seja por aparelho — escuro no telemovel a noite, claro no computador do
 * balcao.
 *
 * O servidor le o cookie para desenhar a pagina ja na cor certa. Em
 * "automatico" nao sabe a preferencia do aparelho, por isso um script pequeno
 * no <head> decide antes de a pagina aparecer (ver `SCRIPT_TEMA`). Sem ele,
 * quem tem o telemovel em escuro via um relampago branco a cada pagina.
 */

export type Tema = 'auto' | 'claro' | 'escuro';

export const COOKIE_TEMA = 'tema';

export const TEMAS: { valor: Tema; rotulo: string }[] = [
  { valor: 'auto', rotulo: 'Automatico (do aparelho)' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
];

/** Qualquer valor desconhecido ou ausente conta como automatico. */
export function lerTema(valor: string | undefined | null): Tema {
  return valor === 'claro' || valor === 'escuro' ? valor : 'auto';
}

/**
 * Corre no <head>, antes de pintar. Le o tema que o servidor escreveu em
 * `data-tema` e poe ou tira a classe `dark`. Tem de ser pequeno e nao pode
 * falhar: vai inteiro como texto para dentro da pagina.
 */
export const SCRIPT_TEMA = `(function(){try{var h=document.documentElement,t=h.dataset.tema,d=t==='escuro'||(t!=='claro'&&matchMedia('(prefers-color-scheme: dark)').matches);h.classList.toggle('dark',d);h.style.colorScheme=d?'dark':'light'}catch(e){}})()`;

/** Aplica o tema a pagina aberta, sem recarregar. So no browser. */
export function aplicarTema(tema: Tema): void {
  const h = document.documentElement;
  h.dataset.tema = tema;
  const escuro =
    tema === 'escuro' ||
    (tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  h.classList.toggle('dark', escuro);
  h.style.colorScheme = escuro ? 'dark' : 'light';
}

/** Guarda a escolha por um ano. Nao e segredo nenhum, por isso nao e httpOnly. */
export function guardarTema(tema: Tema): void {
  document.cookie = `${COOKIE_TEMA}=${tema}; path=/; max-age=31536000; samesite=lax`;
}
