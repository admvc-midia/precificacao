'use server';

/**
 * Importacao de insumos a partir de um CSV.
 *
 * Existe porque cadastrar oitenta insumos a mao e o que faz uma aplicacao
 * destas ser abandonada na primeira semana.
 *
 * Duas escolhas de comportamento:
 *
 *  - **Uma linha ma nao trava o ficheiro.** As boas entram, as outras voltam
 *    com a razao e o numero da linha. Rejeitar tudo por causa de uma virgula
 *    seria a pior forma de tratar quem esta a carregar dados.
 *  - **Nada se apaga.** Um insumo que ja existe com o mesmo nome e fornecedor
 *    e **atualizado**; nunca se remove o que nao esta no ficheiro. Uma
 *    importacao nao pode levar por engano uma ficha tecnica a frente.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { parseIngredientCsv } from '@/lib/providers';
import { baseUnitOf } from '@/lib/units';
import { errorMessage, type ActionState } from './shared';

export interface ImportState extends ActionState {
  /** Detalhe por linha recusada, para o utilizador corrigir o ficheiro. */
  rejeitadas?: Array<{ line: number; reason: string }>;
  criados?: number;
  atualizados?: number;
}

export async function importIngredientsCsv(
  _prev: ImportState,
  form: FormData,
): Promise<ImportState> {
  try {
    const texto = String(form.get('csv') ?? '').trim();
    if (!texto) throw new Error('Cole o conteudo do ficheiro CSV.');

    const { rows, errors } = parseIngredientCsv(texto);
    if (rows.length === 0) {
      return {
        ok: false,
        message: 'Nenhuma linha aproveitavel no ficheiro.',
        rejeitadas: errors,
      };
    }

    // Fornecedores referidos pelo nome: criar os que faltam, uma vez so.
    const nomes = [...new Set(rows.map((r) => r.supplierName).filter(Boolean))] as string[];
    const existentes = await prisma.supplier.findMany({
      where: { name: { in: nomes } },
      select: { id: true, name: true },
    });

    const porNome = new Map(existentes.map((s) => [s.name, s.id]));
    for (const nome of nomes) {
      if (porNome.has(nome)) continue;
      const criado = await prisma.supplier.create({ data: { name: nome } });
      porNome.set(nome, criado.id);
    }

    let criados = 0;
    let atualizados = 0;
    const rejeitadas = [...errors];

    for (const r of rows) {
      const supplierId = r.supplierName ? (porNome.get(r.supplierName) ?? null) : null;

      const dados = {
        name: r.name,
        category: r.category,
        supplierId,
        purchasePrice: r.purchasePrice,
        purchaseQty: r.purchaseQty,
        purchaseUnit: r.unit,
        baseUnit: baseUnitOf(r.unit),
        correctionFactor: r.correctionFactor,
        stockBase: r.stockBase,
      };

      try {
        // O par (nome, fornecedor) e a chave natural: reimportar o mesmo
        // ficheiro com precos novos atualiza em vez de duplicar.
        const ja = await prisma.ingredient.findFirst({
          where: { name: r.name, supplierId },
          select: { id: true, avgCostBase: true },
        });

        if (ja) {
          await prisma.ingredient.update({ where: { id: ja.id }, data: dados });
          atualizados++;
        } else {
          await prisma.ingredient.create({
            data: {
              ...dados,
              // Estoque que vem no ficheiro nasce com base de custo, senao
              // as saidas dele entrariam a zero nas contas.
              avgCostBase:
                r.stockBase > 0 ? r.purchasePrice / toBaseQty(r) : 0,
            },
          });
          criados++;
        }
      } catch (err) {
        rejeitadas.push({ line: r.line, reason: `"${r.name}": ${errorMessage(err)}` });
      }
    }

    revalidatePath('/insumos');
    revalidatePath('/fornecedores');
    revalidatePath('/estoque');
    revalidatePath('/');

    const partes = [
      criados > 0 ? `${criados} criado(s)` : null,
      atualizados > 0 ? `${atualizados} atualizado(s)` : null,
      rejeitadas.length > 0 ? `${rejeitadas.length} recusado(s)` : null,
    ].filter(Boolean);

    return {
      ok: rejeitadas.length === 0,
      message: `Importacao concluida: ${partes.join(', ')}.`,
      rejeitadas,
      criados,
      atualizados,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Tamanho da embalagem de compra na unidade base. */
function toBaseQty(r: { purchaseQty: number; unit: string }): number {
  if (r.unit === 'KG' || r.unit === 'L') return r.purchaseQty * 1000;
  return r.purchaseQty;
}
