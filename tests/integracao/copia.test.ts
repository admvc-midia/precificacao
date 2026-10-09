/**
 * Restaurar uma copia, contra a base de testes a serio, com o Blob simulado.
 *
 * O restauro substitui tabelas inteiras; aqui isso e o schema
 * `precificaragao_teste`, e a copia restaurada e a da propria base de testes
 * com umas linhas marcadas a mais — o `limpar()` do fim leva-as.
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

const blob = vi.hoisted(() => ({ gravados: [] as { pathname: string; access: string; corpo: string }[], n: 0 }));
vi.mock('@vercel/blob', () => ({
  put: async (pathname: string, corpo: string, opts: { access: string }) => {
    const final = pathname.replace(/(\.\w+)$/, `-sufixo${++blob.n}$1`);
    blob.gravados.push({ pathname: final, access: opts.access, corpo });
    return { pathname: final, url: `https://x.private.blob.vercel-storage.com/${final}` };
  },
  list: async () => ({ blobs: [], hasMore: false }),
  get: async () => null,
  del: async () => {},
}));

import { analisarCopiaAction, restaurarCopiaAction } from '@/lib/actions/copia';
import { copiaCompleta, copiaEmJson, type CopiaCompleta } from '@/lib/exportar/gerar';
import { restauraveis } from '@/lib/exportar/restaurar';
import { hashPalavraPasse } from '@/lib/auth';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  limpar,
  nome,
  prisma,
  retrato,
  reporSettings,
  type Retrato,
} from './base';
import { comoSe } from './sessao-falsa';

let antes: Retrato;
const tokenAntes = process.env.BLOB_READ_WRITE_TOKEN;
let dono: { id: string; name: string };

beforeAll(async () => {
  exigirSchemaCerto();
  process.env.BLOB_READ_WRITE_TOKEN = 'teste';
  antes = await retrato();
  await limpar();
  const u = await prisma.user.create({
    data: { username: `zztemp-dono-${Date.now()}`, name: 'Dono (teste)', role: 'OWNER', passwordHash: await hashPalavraPasse('bolo de cenoura com 3 ovos') },
  });
  dono = { id: u.id, name: u.name };
});

afterAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = tokenAntes;
  comoSe('OWNER');
  await limpar();
  await reporSettings(antes);
  await exigirTudoComoEstava(antes);
  await prisma.$disconnect();
});

beforeEach(() => {
  blob.gravados.length = 0;
  comoSe('OWNER', dono.id, dono.name);
});

/** O ficheiro como vem do browser. */
function envio(copia: CopiaCompleta | string, campos: Record<string, string> = {}) {
  const f = new FormData();
  f.set('ficheiro', new File([typeof copia === 'string' ? copia : copiaEmJson(copia)], 'copia.json', { type: 'application/json' }));
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** As tabelas que se restauram, cada uma ordenada por id, para comparar. */
function restauradas(c: CopiaCompleta) {
  return Object.fromEntries(
    restauraveis().map((m) => [
      m.name,
      JSON.stringify(
        [...(c.tabelas[m.name] as Array<{ id: string }>)].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      ),
    ]),
  );
}

/** Um cliente indicado por outro (a tabela aponta para si propria) e uma encomenda. */
async function semear() {
  const quem = await prisma.customer.create({ data: { name: nome('Indicou') } });
  const cliente = await prisma.customer.create({ data: { name: nome('Cliente'), referredById: quem.id, source: 'REFERRAL' } });
  const enc = await prisma.customerOrder.create({ data: { customerId: cliente.id, dueAt: new Date('2026-10-10T15:00:00Z') } });
  const forn = await prisma.supplier.create({ data: { name: nome('Fornecedor') } });
  return { quem, cliente, enc, forn };
}

describe('restaurar uma copia', () => {
  it('a base volta a ficar igual a copia, e a de antes fica guardada', async () => {
    const s = await semear();
    const copia = await copiaCompleta();

    // Depois da copia: muda-se, cria-se e apaga-se.
    await prisma.supplier.update({ where: { id: s.forn.id }, data: { name: nome('Mudado') } });
    const novo = await prisma.supplier.create({ data: { name: nome('Depois') } });
    await prisma.customerOrder.delete({ where: { id: s.enc.id } });
    const contas = await prisma.user.count();
    const registoAntes = await prisma.auditLog.count();

    const r = await restaurarCopiaAction({ ok: true }, envio(copia, { confirmacao: 'restaurar' }));
    expect(r.ok, r.message).toBe(true);

    expect(restauradas(await copiaCompleta())).toEqual(restauradas(copia));
    expect(await prisma.supplier.findUnique({ where: { id: novo.id } })).toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: s.cliente.id } })).referredById).toBe(s.quem.id);

    // Contas e registo nao mudam (o registo so ganha a linha do restauro).
    expect(await prisma.user.count()).toBe(contas);
    expect(await prisma.auditLog.count()).toBe(registoAntes + 1);
    expect(await prisma.auditLog.findFirst({ where: { action: 'copia.restaurar', userId: dono.id } })).not.toBeNull();

    // A de antes: privada, na pasta das copias, e com o fornecedor criado depois.
    expect(blob.gravados).toHaveLength(1);
    expect(blob.gravados[0].pathname).toMatch(/^copias\/antes-de-restaurar-.*\.json$/);
    expect(blob.gravados[0].access).toBe('private');
    expect(blob.gravados[0].corpo).toContain(novo.id);
    expect(blob.gravados[0].corpo).not.toContain('passwordHash');

    // A numeracao das encomendas continua a seguir a maior da copia.
    const maior = Math.max(...(copia.tabelas.CustomerOrder as Array<{ number: number }>).map((e) => e.number));
    const seguinte = await prisma.customerOrder.create({ data: { dueAt: new Date('2026-10-11T10:00:00Z'), customerId: s.cliente.id } });
    expect(seguinte.number).toBe(maior + 1);
  }, 120_000);

  it('analisar diz o que se perde e nao mexe em nada', async () => {
    const copia = await copiaCompleta();
    await new Promise((ok) => setTimeout(ok, 5));
    const depois = await prisma.supplier.create({ data: { name: nome('Depois') } });

    const a = await analisarCopiaAction({ ok: true }, envio(copia));
    expect(a.ok, a.message).toBe(true);
    const forn = a.tabelas!.find((t) => t.modelo === 'Supplier')!;
    expect(forn.depoisDaCopia).toBeGreaterThanOrEqual(1);
    expect(forn.agora).toBe(forn.naCopia + 1);
    expect(a.tabelas!.map((t) => t.modelo)).not.toContain('User');
    expect(await prisma.supplier.findUnique({ where: { id: depois.id } })).not.toBeNull();
  });

  it('sem escrever RESTAURAR, nada muda', async () => {
    const copia = await copiaCompleta();
    const depois = await prisma.supplier.create({ data: { name: nome('Fica') } });
    for (const confirmacao of ['', 'sim', 'RESTAURA']) {
      const r = await restaurarCopiaAction({ ok: true }, envio(copia, { confirmacao }));
      expect(r.ok).toBe(false);
    }
    expect(await prisma.supplier.findUnique({ where: { id: depois.id } })).not.toBeNull();
    expect(blob.gravados).toHaveLength(0);
  });

  it('um ficheiro que nao e copia desta app e recusado sem mexer em nada', async () => {
    const depois = await prisma.supplier.create({ data: { name: nome('Fica') } });
    for (const mau of ['{}', 'nao e json', JSON.stringify({ app: 'outra', gravadoEm: '2026-10-06T10:00:00Z', tabelas: {} })]) {
      expect((await analisarCopiaAction({ ok: true }, envio(mau))).ok).toBe(false);
      expect((await restaurarCopiaAction({ ok: true }, envio(mau, { confirmacao: 'RESTAURAR' }))).ok).toBe(false);
    }
    expect(await prisma.supplier.findUnique({ where: { id: depois.id } })).not.toBeNull();
  });

  it('sem onde guardar a copia de antes, nao restaura', async () => {
    const copia = await copiaCompleta();
    const depois = await prisma.supplier.create({ data: { name: nome('Fica') } });
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const r = await restaurarCopiaAction({ ok: true }, envio(copia, { confirmacao: 'RESTAURAR' }));
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/Blob/);
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = 'teste';
    }
    expect(await prisma.supplier.findUnique({ where: { id: depois.id } })).not.toBeNull();
  });

  it('so o dono: cozinha e leitura nao analisam nem restauram', async () => {
    const copia = await copiaCompleta();
    const depois = await prisma.supplier.create({ data: { name: nome('Fica') } });
    for (const perfil of ['KITCHEN', 'READER'] as const) {
      comoSe(perfil, `zztemp-${perfil}`);
      expect((await analisarCopiaAction({ ok: true }, envio(copia))).ok).toBe(false);
      expect((await restaurarCopiaAction({ ok: true }, envio(copia, { confirmacao: 'RESTAURAR' }))).ok).toBe(false);
    }
    expect(await prisma.supplier.findUnique({ where: { id: depois.id } })).not.toBeNull();
    expect(blob.gravados).toHaveLength(0);
  });
});
