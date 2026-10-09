/**
 * As leituras do modulo de marketing.
 *
 * `resultadosDosCupoes` e o unico sitio onde o marketing toca nas
 * encomendas: conta quantas usaram cada codigo e quanto se descontou. O valor
 * das encomendas so vem quando `comVendas` e verdadeiro — a pagina passa-o so
 * ao dono. Nunca devolve clientes, produtos nem custos.
 */

import { prisma } from '@/lib/db';
import { num, toGlobalSettings } from '@/lib/mappers';
import { grossOf } from '@/lib/pricing/encomendas';
import { getSettings } from '@/lib/queries';

const tarefasOrdenadas = { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] };

export async function getCampanhas() {
  return prisma.campaign.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { tasks: tarefasOrdenadas },
  });
}

export async function getCampanha(id: string) {
  return prisma.campaign.findUnique({ where: { id }, include: { tasks: tarefasOrdenadas } });
}

export async function getGuia() {
  return prisma.marketingGuideSection.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
}

export interface ResultadoDoCupao {
  codigo: string;
  /** O cupao existe em Loja → Cupoes. */
  existe: boolean;
  ativo: boolean;
  encomendas: number;
  descontado: number;
  /** Com IVA. So para o dono (`comVendas`). */
  vendido: number | null;
}

export async function resultadosDosCupoes(codigos: string[], comVendas: boolean): Promise<ResultadoDoCupao[]> {
  if (codigos.length === 0) return [];
  const [cupoes, encomendas, settingsRow] = await Promise.all([
    prisma.coupon.findMany({ where: { code: { in: codigos } }, select: { code: true, active: true } }),
    prisma.customerOrder.findMany({
      where: { couponCode: { in: codigos }, status: { not: 'CANCELLED' } },
      select: {
        couponCode: true,
        couponDiscount: true,
        ...(comVendas ? { lines: { select: { qty: true, unitPrice: true } } } : {}),
      },
    }),
    comVendas ? getSettings() : Promise.resolve(null),
  ]);
  const settings = settingsRow ? toGlobalSettings(settingsRow) : null;

  return codigos.map((codigo) => {
    const doCodigo = encomendas.filter((e) => e.couponCode === codigo);
    const c = cupoes.find((x) => x.code === codigo);
    return {
      codigo,
      existe: Boolean(c),
      ativo: c?.active ?? false,
      encomendas: doCodigo.length,
      descontado: doCodigo.reduce((a, e) => a + (e.couponDiscount == null ? 0 : num(e.couponDiscount)), 0),
      vendido:
        comVendas && settings
          ? doCodigo.reduce(
              (a, e) =>
                a +
                grossOf(
                  ('lines' in e ? (e.lines as Array<{ qty: unknown; unitPrice: unknown }>) : []).reduce(
                    (s, l) => s + num(l.qty) * num(l.unitPrice),
                    0,
                  ),
                  settings,
                ),
              0,
            )
          : null,
    };
  });
}
