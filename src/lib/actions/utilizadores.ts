'use server';

/**
 * Contas, geridas pelo dono.
 *
 * O dono cria a conta com uma palavra-passe provisoria, que a pessoa e
 * obrigada a trocar no primeiro acesso: assim o dono nunca fica a saber a
 * palavra-passe que ela usa.
 *
 * Duas regras que impedem a casa de ficar trancada por fora: nao se pode
 * tirar o ultimo dono ativo, e ninguem se desativa ou despromove a si proprio.
 */

import { revalidatePath } from 'next/cache';

import {
  hashPalavraPasse,
  normalizarUtilizador,
  PERFIL_LABEL,
  problemaNaPalavraPasse,
  utilizadorValido,
  type Perfil,
} from '@/lib/auth';
import { prisma } from '@/lib/db';
import { diferencas, registar } from '@/lib/registo';
import { exigirDono } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

const PERFIS: Perfil[] = ['OWNER', 'KITCHEN', 'READER'];

function campo(form: FormData, nome: string): string | undefined {
  return form.has(nome) ? String(form.get(nome) ?? '').trim() : undefined;
}

function lerPerfil(raw: string | undefined): Perfil {
  if (!raw || !PERFIS.includes(raw as Perfil)) throw new Error('Perfil invalido.');
  return raw as Perfil;
}

export async function criarUtilizador(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const username = normalizarUtilizador(campo(form, 'username') ?? '');
    const name = campo(form, 'name') ?? '';
    const role = lerPerfil(campo(form, 'role'));
    const senha = String(form.get('password') ?? '');

    if (!utilizadorValido(username)) {
      throw new Error('Nome de utilizador: 3 a 32 letras minusculas, numeros, ponto ou hifen.');
    }
    if (!name) throw new Error('Escreva o nome da pessoa.');
    const problema = problemaNaPalavraPasse(senha, username);
    if (problema) throw new Error(problema);
    if (await prisma.user.findUnique({ where: { username } })) {
      throw new Error('Ja existe uma conta com esse nome de utilizador.');
    }

    await prisma.user.create({
      data: {
        username,
        name,
        role,
        passwordHash: await hashPalavraPasse(senha),
        mustChangePassword: true,
      },
    });
    await registar({ quem: eu, acao: 'conta.criar', alvo: `{name} ({username})`, detalhe: `perfil {PERFIL_LABEL[role]}` });
    revalidatePath('/utilizadores');
    return { ok: true, message: `Conta criada. ${name} vai ter de trocar a palavra-passe ao entrar.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Nome, perfil e ativo. Mudar o perfil ou desativar termina as sessoes da
 * pessoa — o cookie dela deixa de bater com a conta.
 */
export async function alterarUtilizador(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Conta nao informada.');
    const atual = await prisma.user.findUniqueOrThrow({ where: { id } });

    const name = campo(form, 'name');
    const role = form.has('role') ? lerPerfil(campo(form, 'role')) : atual.role;
    const active = form.has('activeSubmitted') ? form.get('active') === 'on' : atual.active;

    if (id === eu.id && (role !== 'OWNER' || !active)) {
      throw new Error('Nao pode tirar a si proprio o perfil de dono nem desativar a sua conta.');
    }
    if (atual.role === 'OWNER' && atual.active && (role !== 'OWNER' || !active)) {
      const donos = await prisma.user.count({ where: { role: 'OWNER', active: true } });
      if (donos <= 1) throw new Error('Tem de ficar pelo menos um dono ativo.');
    }

    const mudouAcesso = role !== atual.role || active !== atual.active;
    await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name || atual.name } : {}),
        role,
        active,
        ...(mudouAcesso ? { sessionVersion: { increment: 1 } } : {}),
        // Reativar desbloqueia.
        ...(active && !atual.active ? { failedLogins: 0, lockedUntil: null } : {}),
      },
    });
    await registar({
      quem: eu,
      acao: 'conta.alterar',
      alvo: `{atual.name} ({atual.username})`,
      detalhe:
        diferencas(
          { nome: atual.name, perfil: PERFIL_LABEL[atual.role], ativa: atual.active ? 'sim' : 'nao' },
          { nome: name || atual.name, perfil: PERFIL_LABEL[role], ativa: active ? 'sim' : 'nao' },
        ) || null,
    });
    revalidatePath('/utilizadores');
    return { ok: true, message: 'Conta atualizada.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Palavra-passe provisoria nova, para quem a esqueceu. Termina as sessoes dela. */
export async function reporPalavraPasse(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirDono();
    const id = campo(form, 'id');
    if (!id) throw new Error('Conta nao informada.');
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    const senha = String(form.get('password') ?? '');
    const problema = problemaNaPalavraPasse(senha, u.username);
    if (problema) throw new Error(problema);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPalavraPasse(senha),
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await registar({ quem: eu, acao: 'conta.repor-palavra-passe', alvo: `{u.name} ({u.username})` });
    revalidatePath('/utilizadores');
    return { ok: true, message: `Palavra-passe reposta. ${u.name} vai ter de a trocar ao entrar.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
