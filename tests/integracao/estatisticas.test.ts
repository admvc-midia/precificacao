/**
 * Os contadores do cardapio contra a base: somam no mesmo dia/evento/origem,
 * e a rota dos cliques so aceita cliques de pessoas, com origem conhecida.
 *
 * Usa dias do ano 2000 para nao se misturar com nada real, e apaga-os no fim.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));

import { POST } from '@/app/api/cardapio/evento/route';
import { contar } from '@/lib/cardapio/estatisticas-base';
import { exigirSchemaCerto, prisma } from './base';

const DIA = new Date('2000-01-04T12:00:00Z');
const NO_DIA = { day: new Date('2000-01-04T00:00:00Z') };

beforeAll(async () => {
  exigirSchemaCerto();
  await prisma.menuStat.deleteMany({ where: NO_DIA });
});

afterAll(async () => {
  await prisma.menuStat.deleteMany({ where: { day: { lt: new Date('2001-01-01T00:00:00Z') } } });
  await prisma.$disconnect();
});

describe('contadores do cardapio', () => {
  it('somam no mesmo dia, evento e origem', async () => {
    await contar('VIEW', 'instagram', DIA);
    await contar('VIEW', 'instagram', DIA);
    await contar('ORDER', 'instagram', DIA);
    const linhas = await prisma.menuStat.findMany({ where: NO_DIA, orderBy: { event: 'asc' } });
    expect(linhas.map((l) => [l.event, l.source, l.count])).toEqual([
      ['VIEW', 'instagram', 2],
      ['ORDER', 'instagram', 1],
    ]);
  });

  it('a rota conta cliques de pessoas e ignora o resto', async () => {
    const pedido = (corpo: string, ua = 'Mozilla/5.0 (iPhone) Instagram') =>
      new Request('http://x/api/cardapio/evento', { method: 'POST', body: corpo, headers: { 'user-agent': ua } });
    const antes = await prisma.menuStat.aggregate({ _sum: { count: true }, where: { event: { in: ['ORDER', 'QUOTE'] } } });

    expect((await POST(pedido(JSON.stringify({ e: 'QUOTE', o: 'qr' })))).status).toBe(204);
    // Ignorados: robo, evento que nao e clique, lixo.
    await POST(pedido(JSON.stringify({ e: 'ORDER', o: 'qr' }), 'facebookexternalhit/1.1'));
    await POST(pedido(JSON.stringify({ e: 'VIEW', o: 'qr' })));
    await POST(pedido('nao e json'));

    const depois = await prisma.menuStat.aggregate({ _sum: { count: true }, where: { event: { in: ['ORDER', 'QUOTE'] } } });
    expect((depois._sum.count ?? 0) - (antes._sum.count ?? 0)).toBe(1);

    // O clique da rota conta no dia de hoje: tira-se para nao ficar nos numeros da casa de testes.
    await prisma.menuStat.updateMany({ where: { event: 'QUOTE', source: 'qr', count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  });

  it('eventos de produto: so de itens que existem', async () => {
    const nomeItem = `ZZTEMP-Item-${Date.now()}`;
    const item = await prisma.menuItem.create({ data: { kind: 'PRODUCT', name: nomeItem, price: 1 } });
    try {
      const pedido = (corpo: object) =>
        new Request('http://x/api/cardapio/evento', {
          method: 'POST',
          body: JSON.stringify(corpo),
          headers: { 'user-agent': 'Mozilla/5.0 (Android) Chrome/120 Mobile' },
        });
      await POST(pedido({ e: 'OPEN', o: 'instagram', i: item.id }));
      await POST(pedido({ e: 'OPEN', o: 'instagram', i: item.id }));
      await POST(pedido({ e: 'ADD', o: 'instagram', i: item.id }));
      await POST(pedido({ e: 'OPEN', i: 'naoexiste123' }));
      await POST(pedido({ e: 'OPEN' }));
      const linhas = await prisma.menuItemStat.findMany({ where: { menuItemId: { in: [item.id, 'naoexiste123'] } } });
      expect(linhas.map((l) => [l.menuItemId, l.event, l.count]).sort()).toEqual([
        [item.id, 'ADD', 1],
        [item.id, 'OPEN', 2],
      ]);
    } finally {
      await prisma.menuItemStat.deleteMany({ where: { menuItemId: item.id } });
      await prisma.menuItem.delete({ where: { id: item.id } });
    }
  });
});
