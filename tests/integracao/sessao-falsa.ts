/**
 * Sessao para os testes contra a base.
 *
 * As actions confirmam quem esta a usar a app lendo o cookie (`lib/sessao.ts`),
 * e aqui nao ha pedido nem cookie. Isto troca esse modulo por um que responde
 * com o perfil que o teste escolher — por omissao, dono.
 *
 * As regras de perfil sao as mesmas do modulo verdadeiro; so muda de onde vem
 * a pessoa. As regras do cookie em si testam-se em `tests/auth.test.ts`.
 */

import { vi } from 'vitest';

import type { Perfil } from '@/lib/auth';

interface Falsa {
  id: string | null;
  perfil: Perfil | null;
  nome: string;
}

const estado: Falsa = { id: null, perfil: 'OWNER', nome: 'Teste' };

/** Muda quem esta "com sessao". `null` = ninguem. */
export function comoSe(perfil: Perfil | null, id: string | null = null, nome = 'Teste') {
  estado.perfil = perfil;
  estado.id = id;
  estado.nome = nome;
}

vi.mock('@/lib/sessao', () => {
  const atual = async () =>
    estado.perfil === null
      ? null
      : {
          id: estado.id ?? 'teste',
          username: 'zztemp-teste',
          name: estado.nome,
          perfil: estado.perfil,
          mustChangePassword: false,
        };
  const exigirPerfil = async (...perfis: Perfil[]) => {
    const u = await atual();
    if (!u) throw new Error('A sessao terminou. Entre outra vez.');
    if (!perfis.includes(u.perfil)) throw new Error('Sem permissao para isto.');
    return u;
  };
  return {
    utilizadorAtual: atual,
    exigirPerfil,
    exigirDono: () => exigirPerfil('OWNER'),
    exigirEditorDoLivro: () => exigirPerfil('OWNER', 'KITCHEN'),
    exigirSessao: () => exigirPerfil('OWNER', 'KITCHEN', 'READER'),
    exigirConta: () => exigirPerfil('OWNER', 'KITCHEN', 'READER', 'MARKETING'),
    exigirMarketing: () => exigirPerfil('OWNER', 'MARKETING'),
  };
});
