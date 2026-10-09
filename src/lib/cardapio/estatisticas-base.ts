/**
 * Gravar e ler os contadores do cardapio (`MenuStat`). As contas puras (de
 * onde veio, robos, o resumo) estao em `./estatisticas.ts`.
 */

import { diaEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import { resumir, segundaDe, type Evento, type Origem, type Resumo } from './estatisticas';

/** Soma um ao contador do dia. Nunca lanca: uma estatistica nao parte a pagina. */
export async function contar(evento: Evento, origem: Origem, agora = new Date()): Promise<void> {
  const day = new Date(`${diaEmLisboa(agora)}T00:00:00Z`);
  try {
    await prisma.menuStat.upsert({
      where: { day_event_source: { day, event: evento, source: origem } },
      create: { day, event: evento, source: origem, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn('[cardapio] nao consegui contar', evento, origem, err);
  }
}

/** Le os ultimos ~9 semanas da base e resume. */
export async function resumoDoCardapio(agora = new Date()): Promise<Resumo> {
  const hoje = diaEmLisboa(agora);
  const desde = new Date(`${segundaDe(hoje)}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 7 * 8);
  let linhas: Awaited<ReturnType<typeof prisma.menuStat.findMany>>;
  try {
    linhas = await prisma.menuStat.findMany({ where: { day: { gte: desde } } });
  } catch (err) {
    // Codigo publicado antes do `db push` da tabela: numeros a zero em vez de
    // partir o ecra do Cardapio e as Campanhas.
    if ((err as { code?: string }).code !== 'P2021') throw err;
    linhas = [];
  }
  return resumir(
    linhas.map((l) => ({ day: l.day.toISOString().slice(0, 10), event: l.event, source: l.source, count: l.count })),
    hoje,
  );
}
