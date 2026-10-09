/**
 * Redes sociais do cliente, contra a base de testes: o que se escreve e
 * arrumado antes de gravar, um valor errado nao grava nada, e um campo que
 * nao vem no formulario nao e apagado.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { createCustomer, updateCustomer } from '@/lib/actions/clientes';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  nome,
  prisma,
  retrato,
  reporSettings,
  type Retrato,
} from './base';
import { comoSe } from './sessao-falsa';

let antes: Retrato;

beforeAll(async () => {
  exigirSchemaCerto();
  antes = await retrato();
  await limpar();
});

afterAll(async () => {
  comoSe('OWNER');
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

beforeEach(() => comoSe('OWNER'));

describe('redes sociais do cliente', () => {
  it('ao criar, guarda so o nome de utilizador', async () => {
    const n = nome('Ana');
    await expect(
      createCustomer(
        { ok: true },
        form({ name: n, instagram: 'https://www.instagram.com/Ana.Doces/?hl=pt', tiktok: '@ana.doces', facebook: '' }),
      ),
    ).rejects.toThrow('REDIRECT');
    const c = await prisma.customer.findFirstOrThrow({ where: { name: n } });
    expect(c).toMatchObject({ instagram: 'ana.doces', tiktok: 'ana.doces', facebook: null });
  });

  it('ao alterar: arruma, limpa com vazio, e nao mexe no que nao veio', async () => {
    const c = await prisma.customer.create({ data: { name: nome('Rui'), instagram: 'rui.bolos', phone: '912345678' } });

    const r = await updateCustomer({ ok: true }, form({ id: c.id, facebook: 'https://m.facebook.com/profile.php?id=100012345678' }));
    expect(r.ok, r.message).toBe(true);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      instagram: 'rui.bolos',
      facebook: 'profile.php?id=100012345678',
      phone: '912345678',
    });

    await updateCustomer({ ok: true }, form({ id: c.id, instagram: '' }));
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).instagram).toBeNull();
  });

  it('um valor errado nao grava nada, nem os outros campos do formulario', async () => {
    const c = await prisma.customer.create({ data: { name: nome('Bia'), tiktok: 'bia.doces' } });
    const r = await updateCustomer(
      { ok: true },
      form({ id: c.id, name: nome('Outro nome'), instagram: 'https://www.tiktok.com/@bia', tiktok: '' }),
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Instagram/);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ name: c.name, tiktok: 'bia.doces', instagram: null });
  });

  it('so o dono altera', async () => {
    const c = await prisma.customer.create({ data: { name: nome('Caio') } });
    comoSe('KITCHEN', 'zztemp-cozinha');
    expect((await updateCustomer({ ok: true }, form({ id: c.id, instagram: 'caio' }))).ok).toBe(false);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).instagram).toBeNull();
  });
});
