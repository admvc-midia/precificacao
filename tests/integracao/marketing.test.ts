/**
 * Marketing contra a base: o perfil MARKETING cria, altera e apaga campanhas,
 * tarefas e o guia; a cozinha nao; os resultados dos cupoes contam so
 * encomendas nao canceladas e so dao o valor vendido ao dono.
 *
 * Tudo marcado com ZZTEMP- e apagado no fim (ver `limpar`).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { createCustomerOrder, setCustomerOrderStatus } from '@/lib/actions/encomendas';
import {
  alternarTarefa,
  apagarCampanha,
  apagarSecaoGuia,
  guardarCampanha,
  guardarSecaoGuia,
  guardarTarefa,
  moverTarefa,
} from '@/lib/actions/marketing';
import { guardarCupao } from '@/lib/actions/promocoes';
import { resultadosDosCupoes } from '@/lib/marketing/consultas';
import {
  exigirSchemaCerto,
  exigirTudoComoEstava,
  form,
  limpar,
  MARCA,
  nome,
  prisma,
  reporSettings,
  retrato,
  type Retrato,
} from './base';
import { produto } from './ajudas';
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

async function ok(r: Promise<{ ok: boolean; message?: string }>) {
  const x = await r;
  expect(x.ok, x.message).toBe(true);
}

describe('o perfil Marketing', () => {
  it('cria, altera e apaga campanhas, tarefas e o guia', async () => {
    comoSe('MARKETING');
    try {
      const titulo = nome('Natal empresas');
      await ok(
        guardarCampanha(
          { ok: true },
          (() => {
            const f = form({ title: titulo, status: 'PLANNED', startsAt: '2026-10-10', endsAt: '2026-12-20', budget: '80,50', couponCodes: 'natal25, IG10 ig10' });
            f.append('channel', 'PARTNERS');
            f.append('channel', 'INVENTADO');
            return f;
          })(),
        ),
      );
      const c = await prisma.campaign.findFirstOrThrow({ where: { title: titulo } });
      expect(c.channels).toEqual(['PARTNERS']);
      expect(c.couponCodes).toEqual(['NATAL25', 'IG10']);
      expect(Number(c.budget)).toBe(80.5);

      const errada = await guardarCampanha({ ok: true }, form({ title: nome('X'), startsAt: '2026-12-01', endsAt: '2026-11-01' }));
      expect(errada.ok).toBe(false);

      await ok(guardarTarefa({ ok: true }, form({ campaignId: c.id, title: 'Lista de empresas', assignee: 'Ana', dueAt: '2026-10-15' })));
      await ok(guardarTarefa({ ok: true }, form({ campaignId: c.id, title: 'Visitas' })));
      let ts = await prisma.campaignTask.findMany({ where: { campaignId: c.id }, orderBy: { position: 'asc' } });
      expect(ts.map((t) => t.title)).toEqual(['Lista de empresas', 'Visitas']);

      await ok(moverTarefa({ ok: true }, form({ id: ts[1].id, sentido: 'cima' })));
      await ok(alternarTarefa({ ok: true }, form({ id: ts[0].id })));
      ts = await prisma.campaignTask.findMany({ where: { campaignId: c.id }, orderBy: { position: 'asc' } });
      expect(ts.map((t) => t.title)).toEqual(['Visitas', 'Lista de empresas']);
      expect(ts[1].done).toBe(true);
      expect(ts[1].doneAt).not.toBeNull();

      const g = nome('Regras');
      await ok(guardarSecaoGuia({ ok: true }, form({ title: g, body: '- RGPD' })));
      const sec = await prisma.marketingGuideSection.findFirstOrThrow({ where: { title: g } });
      await ok(apagarSecaoGuia({ ok: true }, form({ id: sec.id })));

      await ok(apagarCampanha({ ok: true }, form({ id: c.id })));
      expect(await prisma.campaignTask.count({ where: { campaignId: c.id } })).toBe(0);

      // Cupoes sao do dono.
      const cupao = await guardarCupao({ ok: true }, form({ code: 'ZZTEMP-MK', kind: 'PERCENT', value: '5', startsAt: '2026-10-01' }));
      expect(cupao).toEqual({ ok: false, message: 'Sem permissao para isto.' });
    } finally {
      comoSe('OWNER');
    }
  });

  it('a cozinha nao mexe no marketing', async () => {
    comoSe('KITCHEN');
    try {
      const r = await guardarCampanha({ ok: true }, form({ title: nome('Nao'), status: 'IDEA' }));
      expect(r).toEqual({ ok: false, message: 'Sem permissao para isto.' });
    } finally {
      comoSe('OWNER');
    }
  });
});

describe('resultados dos cupoes', () => {
  it('contam so as nao canceladas, e o valor vendido so para o dono', async () => {
    const bolo = await produto(10);
    const codigo = `${MARCA}MK10`.toUpperCase();
    await ok(guardarCupao({ ok: true }, form({ code: codigo, kind: 'PERCENT', value: '10', startsAt: '2026-10-01', scope: 'todos' })));

    // `nome()` acrescenta um sufixo aleatorio: guardar os nomes.
    const joana = nome('Joana');
    const nomeMarta = nome('Marta');
    const pedido = (quem: string) =>
      form({ customerName: quem, dueAt: '2026-10-20T10:00', 'linha.0.recipeId': bolo.id, 'linha.0.qty': '2', couponCode: codigo });
    for (const q of [joana, nomeMarta]) {
      await expect(createCustomerOrder({ ok: true }, pedido(q))).rejects.toThrow(/^REDIRECT/);
    }
    const marta = await prisma.customerOrder.findFirstOrThrow({ where: { customer: { name: nomeMarta } } });
    await ok(setCustomerOrderStatus({ ok: true }, form({ id: marta.id, status: 'CANCELLED' })));

    const [doMarketing] = await resultadosDosCupoes([codigo], false);
    expect(doMarketing).toMatchObject({ codigo, existe: true, encomendas: 1, vendido: null });
    expect(doMarketing.descontado).toBeCloseTo(2);

    const [doDono] = await resultadosDosCupoes([codigo], true);
    expect(doDono.vendido).toBeCloseTo(18);

    const [porCriar] = await resultadosDosCupoes(['ZZTEMP-NAOEXISTE'], false);
    expect(porCriar).toMatchObject({ existe: false, encomendas: 0 });
  });
});
