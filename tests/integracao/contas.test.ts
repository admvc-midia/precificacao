/**
 * Contas contra a base a serio: entrar, bloqueio, palavra-passe provisoria,
 * gestao pelo dono.
 *
 * O cookie e escrito num frasco falso (`next/headers` simulado), e lido de
 * volta com `lerSessao` — prova-se que quem entra leva no cookie quem e.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const frasco = new Map<string, string>();
/** O endereco "de onde" vem o pedido; cada teste usa o seu (rede de documentacao, RFC 5737). */
const pedido = { ip: '203.0.113.1' };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (frasco.has(n) ? { name: n, value: frasco.get(n)! } : undefined),
    set: (n: string, v: string) => frasco.set(n, v),
    delete: (n: string) => frasco.delete(n),
  }),
  headers: async () => new Headers({ 'x-real-ip': pedido.ip }),
}));
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

import { criarPrimeiroDono, entrar, trocarPalavraPasse } from '@/lib/actions/auth';
import { alterarUtilizador, criarUtilizador, reporPalavraPasse } from '@/lib/actions/utilizadores';
import { COOKIE, confereHash, hashPalavraPasse, lerSessao } from '@/lib/auth';
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

const SENHA = 'bolo de cenoura com 3 ovos';
const APP_ORIGINAL = process.env.APP_PASSWORD;
let antes: Retrato;
let dono: { id: string; name: string };

beforeAll(async () => {
  exigirSchemaCerto();
  process.env.APP_PASSWORD = 'palavra-passe-da-app-de-teste';
  antes = await retrato();
  await limpar();
  dono = await prisma.user.create({
    data: {
      username: nome('dono').toLowerCase(),
      name: 'Dono Teste',
      role: 'OWNER',
      passwordHash: await hashPalavraPasse(SENHA),
    },
  });
});

let proximoIp = 10;
afterEach(() => {
  frasco.clear();
  pedido.ip = `203.0.113.${proximoIp++}`;
  comoSe('OWNER', dono.id, dono.name);
});

afterAll(async () => {
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: '203.0.113.' } } });
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  if (APP_ORIGINAL === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = APP_ORIGINAL;
  await prisma.$disconnect();
});

async function conta(extra: { mustChangePassword?: boolean; active?: boolean } = {}) {
  return prisma.user.create({
    data: {
      username: nome('ana').toLowerCase(),
      name: 'Ana',
      role: 'KITCHEN',
      passwordHash: await hashPalavraPasse(SENHA),
      ...extra,
    },
  });
}

describe('entrar', () => {
  it('com a palavra-passe certa: cookie com a conta e o perfil, e vai para as encomendas', async () => {
    const u = await conta();
    await expect(entrar({ ok: true }, form({ username: u.username.toUpperCase(), password: SENHA }))).rejects.toThrow(
      'REDIRECT /encomendas',
    );
    expect(lerSessao(frasco.get(COOKIE))).toMatchObject({ userId: u.id, perfil: 'KITCHEN', versao: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastLoginAt).not.toBeNull();
  });

  it('a mesma mensagem para conta inexistente, errada ou desativada', async () => {
    const desativada = await conta({ active: false });
    const r1 = await entrar({ ok: true }, form({ username: 'nao-existe-nunca', password: SENHA }));
    const r2 = await entrar({ ok: true }, form({ username: desativada.username, password: 'errada-errada' }));
    const r3 = await entrar({ ok: true }, form({ username: desativada.username, password: SENHA }));
    expect(new Set([r1.message, r2.message, r3.message]).size).toBe(1);
    expect(frasco.has(COOKIE)).toBe(false);
  });

  it('a 5.a falha bloqueia, mesmo com a certa a seguir', async () => {
    const u = await conta();
    for (let i = 0; i < 5; i++) {
      await entrar({ ok: true }, form({ username: u.username, password: `errada-${i}-xxxxx` }));
    }
    const bloqueada = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(bloqueada.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const r = await entrar({ ok: true }, form({ username: u.username, password: SENHA }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/bloqueada/);
    expect(frasco.has(COOKIE)).toBe(false);
  }, 20_000);

  it('"manter neste aparelho" da 30 dias; sem isso, 12 horas', async () => {
    const u = await conta();
    await expect(entrar({ ok: true }, form({ username: u.username, password: SENHA }))).rejects.toThrow('REDIRECT');
    const curta = lerSessao(frasco.get(COOKIE))!;
    expect(curta.expira - Date.now()).toBeLessThanOrEqual(12 * 3_600_000);
    frasco.clear();
    await expect(
      entrar({ ok: true }, form({ username: u.username, password: SENHA, lembrar: 'on' })),
    ).rejects.toThrow('REDIRECT');
    expect(lerSessao(frasco.get(COOKIE))!.expira - Date.now()).toBeGreaterThan(29 * 86_400_000);
  });

  it('muitas falhas da mesma origem, em contas diferentes, bloqueiam a origem', async () => {
    // Uma palavra-passe comum tentada em muitas contas, uma vez cada: o
    // bloqueio por conta nunca dispara, o da origem sim.
    const certa = await conta();
    for (let i = 0; i < 20; i++) {
      await entrar({ ok: true }, form({ username: `nao-existe-${i}`, password: 'palavra-passe-comum' }));
    }
    const r = await entrar({ ok: true }, form({ username: certa.username, password: SENHA }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/desta ligacao/);
    expect(frasco.has(COOKIE)).toBe(false);

    // De outra origem, a mesma conta entra.
    pedido.ip = '203.0.113.250';
    await expect(entrar({ ok: true }, form({ username: certa.username, password: SENHA }))).rejects.toThrow('REDIRECT');
  }, 60_000);

  it('entradas e falhas ficam no registo', async () => {
    const u = await conta();
    await entrar({ ok: true }, form({ username: u.username, password: 'errada-errada-xx' }));
    await expect(entrar({ ok: true }, form({ username: u.username, password: SENHA }))).rejects.toThrow('REDIRECT');
    const registo = await prisma.auditLog.findMany({ where: { OR: [{ userId: u.id }, { target: u.username }] } });
    expect(registo.map((r) => r.action).sort()).toEqual(['entrar', 'entrar.falhou']);
    expect(JSON.stringify(registo)).not.toContain('errada-errada-xx');
  });

  it('palavra-passe provisoria manda trocar', async () => {
    const u = await conta({ mustChangePassword: true });
    await expect(entrar({ ok: true }, form({ username: u.username, password: SENHA }))).rejects.toThrow(
      'REDIRECT /conta?trocar=1',
    );
  });

  it('o "de" so aceita caminhos deste sitio', async () => {
    const u = await conta();
    await expect(
      entrar({ ok: true }, form({ username: u.username, password: SENHA, de: '//outro-sitio.com' })),
    ).rejects.toThrow('REDIRECT /encomendas');
  });

  it('a primeira conta de dono so se cria sem nenhuma conta', async () => {
    const r = await criarPrimeiroDono(
      { ok: true },
      form({
        appPassword: 'palavra-passe-da-app-de-teste',
        username: nome('outro').toLowerCase(),
        name: 'Outro',
        password: SENHA,
        password2: SENHA,
      }),
    );
    expect(r).toEqual({ ok: false, message: 'Ja existe uma conta. Entre com ela.' });
  });
});

describe('contas, pelo dono', () => {
  it('cria com palavra-passe provisoria, recusa fracas e repetidas', async () => {
    const username = nome('rui').toLowerCase();
    expect((await criarUtilizador({ ok: true }, form({ username, name: 'Rui', role: 'READER', password: 'curta' }))).ok).toBe(false);
    const r = await criarUtilizador({ ok: true }, form({ username, name: 'Rui', role: 'READER', password: SENHA }));
    expect(r.ok, r.message).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { username } });
    expect(u.mustChangePassword).toBe(true);
    expect(await confereHash(SENHA, u.passwordHash)).toBe(true);
    expect(u.passwordHash).not.toContain(SENHA);
    expect((await criarUtilizador({ ok: true }, form({ username, name: 'Rui 2', role: 'READER', password: SENHA }))).ok).toBe(false);
  });

  it('a cozinha nao gere contas', async () => {
    comoSe('KITCHEN');
    const r = await criarUtilizador({ ok: true }, form({ username: nome('x').toLowerCase(), name: 'X', role: 'OWNER', password: SENHA }));
    expect(r).toEqual({ ok: false, message: 'Sem permissao para isto.' });
  });

  it('ninguem se despromove nem se desativa a si proprio', async () => {
    const r1 = await alterarUtilizador({ ok: true }, form({ id: dono.id, role: 'KITCHEN', activeSubmitted: '1', active: 'on' }));
    expect(r1.ok).toBe(false);
    const r2 = await alterarUtilizador({ ok: true }, form({ id: dono.id, role: 'OWNER', activeSubmitted: '1' }));
    expect(r2.ok).toBe(false);
  });

  it('mudar o perfil ou repor a palavra-passe termina as sessoes da pessoa', async () => {
    const u = await conta();
    await alterarUtilizador({ ok: true }, form({ id: u.id, role: 'READER', activeSubmitted: '1', active: 'on' }));
    let depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect([depois.role, depois.sessionVersion]).toEqual(['READER', 1]);

    // So o nome: nao mexe nas sessoes.
    await alterarUtilizador({ ok: true }, form({ id: u.id, name: 'Ana Silva' }));
    depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect([depois.name, depois.role, depois.active, depois.sessionVersion]).toEqual(['Ana Silva', 'READER', true, 1]);

    await reporPalavraPasse({ ok: true }, form({ id: u.id, password: 'outra palavra-passe longa' }));
    depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.sessionVersion).toBe(2);
    expect(depois.mustChangePassword).toBe(true);
  });
});

describe('a propria conta', () => {
  it('trocar a palavra-passe pede a atual e renova o cookie', async () => {
    const u = await conta({ mustChangePassword: true });
    comoSe('KITCHEN', u.id, u.name);

    const errada = await trocarPalavraPasse({ ok: true }, form({ atual: 'nao-e-esta', nova: 'nova palavra-passe', nova2: 'nova palavra-passe' }));
    expect(errada.ok).toBe(false);
    const diferentes = await trocarPalavraPasse({ ok: true }, form({ atual: SENHA, nova: 'nova palavra-passe', nova2: 'outra coisa qualquer' }));
    expect(diferentes.ok).toBe(false);

    const r = await trocarPalavraPasse({ ok: true }, form({ atual: SENHA, nova: 'nova palavra-passe', nova2: 'nova palavra-passe' }));
    expect(r.ok, r.message).toBe(true);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.mustChangePassword).toBe(false);
    expect(depois.sessionVersion).toBe(1);
    expect(await confereHash('nova palavra-passe', depois.passwordHash)).toBe(true);
    expect(lerSessao(frasco.get(COOKIE))).toMatchObject({ userId: u.id, versao: 1 });
  });
});
