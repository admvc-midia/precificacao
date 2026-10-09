/**
 * A receita do livro ligada a uma ficha tecnica, mostrada NA ficha: os
 * ingredientes como foram escritos e o modo de fazer, na versao em uso.
 *
 * A ligacao vive na receita (`BookRecipe.fichaId`); sem isto so se via de um
 * lado. Avisa quando a receita mudou depois da ultima alteracao da ficha — as
 * quantidades da ficha (que dao os custos) podem ja nao bater.
 *
 * `papel`: a versao para a ficha impressa, so com o modo de fazer (quem esta
 * na bancada), sem links nem avisos.
 */

import Link from 'next/link';
import { AlertTriangle, BookOpen } from 'lucide-react';

import { Ingredientes, Passos } from '@/components/livro/receita-texto';
import { Alert } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db';

const dataFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' });

async function receitasDaFicha(fichaId: string) {
  const rs = await prisma.bookRecipe.findMany({
    where: { fichaId, archivedAt: null },
    orderBy: { title: 'asc' },
    include: {
      versions: {
        orderBy: { number: 'desc' },
        select: { number: true, ingredients: true, steps: true, yield: true, createdAt: true, authorName: true },
      },
    },
  });
  return rs.map((r) => ({
    id: r.id,
    title: r.title,
    versao: r.versions.find((v) => v.number === r.currentVersion) ?? r.versions[0],
  }));
}

/** A receita mudou depois da ficha (a v1 e a original: nao conta). */
export function receitaMudouDepois(versao: { number: number; createdAt: Date }, fichaAtualizada: Date): boolean {
  return versao.number > 1 && versao.createdAt > fichaAtualizada;
}

export async function ReceitaDaFicha({
  fichaId,
  fichaAtualizada,
  papel = false,
}: {
  fichaId: string;
  fichaAtualizada: Date;
  papel?: boolean;
}) {
  const receitas = (await receitasDaFicha(fichaId)).filter((r) => r.versao);
  if (receitas.length === 0) return null;

  if (papel) {
    return (
      <section className="space-y-4">
        {receitas.map((r) => (
          <div key={r.id} className="space-y-2">
            <h2 className="text-base font-semibold">Modo de fazer{receitas.length > 1 ? ` · ${r.title}` : ''}</h2>
            <Passos texto={r.versao!.steps} className="text-sm" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <>
      {receitas.map((r) => {
        const v = r.versao!;
        const mudou = receitaMudouDepois(v, fichaAtualizada);
        return (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                Receita do livro:{' '}
                <Link href={`/receitas/${r.id}`} className="text-primary hover:underline">
                  {r.title}
                </Link>
              </CardTitle>
              <CardDescription>
                Versão {v.number} ({v.authorName}, {dataFmt.format(v.createdAt)})
                {v.yield ? ` · ${v.yield}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mudou ? (
                <Alert tone="warning" className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    A receita mudou (versão {v.number}, {dataFmt.format(v.createdAt)}) depois da última
                    alteração desta ficha. Confira se as quantidades da composição ainda batem — os
                    custos saem delas.
                  </span>
                </Alert>
              ) : null}
              <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Ingredientes</h3>
                  <Ingredientes texto={v.ingredients} className="text-sm" />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Modo de fazer</h3>
                  <Passos texto={v.steps} className="text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
