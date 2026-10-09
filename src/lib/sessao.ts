/**
 * Quem esta a usar a aplicacao, confirmado na base.
 *
 * O cookie diz quem a pessoa era quando entrou (ver `lib/auth.ts`). Isto
 * confirma que ainda e: conta ativa, mesmo perfil, mesma versao de sessao.
 * Desativar alguem, mudar-lhe o perfil ou trocar-lhe a palavra-passe tem
 * efeito no pedido seguinte, e nao daqui a 30 dias quando o cookie expirar.
 *
 * Vive fora de `lib/actions/` de proposito: um ficheiro 'use server' exporta
 * tudo como action chamavel do browser, e isto e para ser chamado por elas.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';

import { COOKIE, lerSessao, type Perfil } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface Utilizador {
  id: string;
  username: string;
  name: string;
  perfil: Perfil;
  mustChangePassword: boolean;
}

/** A pessoa da sessao, ou `null` (sem cookie, cookie invalido, conta mudada). */
export const utilizadorAtual = cache(async (): Promise<Utilizador | null> => {
  const sessao = lerSessao((await cookies()).get(COOKIE)?.value);
  if (!sessao) return null;

  const u = await prisma.user.findUnique({
    where: { id: sessao.userId },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      active: true,
      sessionVersion: true,
      mustChangePassword: true,
    },
  });
  if (!u || !u.active || u.sessionVersion !== sessao.versao || u.role !== sessao.perfil) {
    return null;
  }
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    perfil: u.role,
    mustChangePassword: u.mustChangePassword,
  };
});

/**
 * Exige um destes perfis. Lanca com uma mensagem que as actions devolvem ao
 * ecra — e que nao diz mais do que o necessario.
 */
export async function exigirPerfil(...perfis: Perfil[]): Promise<Utilizador> {
  const u = await utilizadorAtual();
  if (!u) throw new Error('A sessao terminou. Entre outra vez.');
  if (!perfis.includes(u.perfil)) throw new Error('Sem permissao para isto.');
  return u;
}

/** Tudo o que mexe em custos, encomendas, clientes ou configuracoes. */
export function exigirDono(): Promise<Utilizador> {
  return exigirPerfil('OWNER');
}

/** Criar e alterar receitas e livros. */
export function exigirEditorDoLivro(): Promise<Utilizador> {
  return exigirPerfil('OWNER', 'KITCHEN');
}

/** Ler o livro: dono, cozinha e leitura (o marketing nao). */
export function exigirSessao(): Promise<Utilizador> {
  return exigirPerfil('OWNER', 'KITCHEN', 'READER');
}

/** A propria conta (palavra-passe, sessoes): qualquer perfil com sessao valida. */
export function exigirConta(): Promise<Utilizador> {
  return exigirPerfil('OWNER', 'KITCHEN', 'READER', 'MARKETING');
}

/** As campanhas e o guia de marketing. */
export function exigirMarketing(): Promise<Utilizador> {
  return exigirPerfil('OWNER', 'MARKETING');
}
