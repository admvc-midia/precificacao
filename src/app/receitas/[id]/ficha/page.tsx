/**
 * Criar a ficha tecnica a partir de uma receita do livro: a app le os
 * ingredientes (`lib/livro/ingredientes.ts`), propoe o insumo e a quantidade
 * de cada linha, e o dono reve antes de criar. So o dono (custos).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { RevisaoFicha, type LinhaProposta, type OpcaoDeInsumo } from '@/components/livro/revisao-ficha';
import { Alert } from '@/components/ui/badge';
import { prisma } from '@/lib/db';
import { detalheReceita } from '@/lib/livro/consultas';
import {
  lerIngredientes,
  lerRendimento,
  maisParecido,
  quantidadeNaFicha,
  type BaseDoAlvo,
} from '@/lib/livro/ingredientes';
import { exigirSessao } from '@/lib/sessao';
import { DISPLAY_UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

/** Com virgula e sem zeros a mais: 0.2 → "0,2". */
function numero(v: number): string {
  return String(Math.round(v * 10_000) / 10_000).replace('.', ',');
}

export default async function CriarFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const eu = await exigirSessao();
  const { id } = await params;
  if (eu.perfil !== 'OWNER') notFound();
  const r = await detalheReceita(id);
  if (!r) notFound();
  if (r.ficha) redirect(`/fichas/${r.ficha.id}`);

  const versao = r.versions.find((v) => v.number === r.currentVersion) ?? r.versions[0];
  const [insumos, bases, mesmoNome] = await Promise.all([
    prisma.ingredient.findMany({ where: { category: 'FOOD' }, select: { id: true, name: true, baseUnit: true }, orderBy: { name: 'asc' } }),
    prisma.recipe.findMany({ where: { kind: 'BASE' }, select: { id: true, name: true, yieldUnit: true }, orderBy: { name: 'asc' } }),
    prisma.recipe.findUnique({ where: { name: r.title }, select: { id: true } }),
  ]);

  const baseDe = new Map<string, BaseDoAlvo>();
  const opcoes: OpcaoDeInsumo[] = [
    ...insumos.map((i) => {
      baseDe.set(`ING:${i.id}`, i.baseUnit);
      return { ref: `ING:${i.id}`, nome: i.name, unidade: DISPLAY_UNIT_LABEL[i.baseUnit], grupo: 'Insumos' as const };
    }),
    ...bases.map((b) => {
      baseDe.set(`REC:${b.id}`, b.yieldUnit);
      return { ref: `REC:${b.id}`, nome: b.name, unidade: DISPLAY_UNIT_LABEL[b.yieldUnit], grupo: 'Preparações base' as const };
    }),
  ];
  const candidatos = opcoes.map((o) => ({ ref: o.ref, nome: o.nome }));

  const linhas: LinhaProposta[] = lerIngredientes(versao?.ingredients ?? '').map((l) => {
    if (l.titulo) return { original: l.original.trim(), titulo: true, ref: '', qty: '', motivo: null, incluir: false };
    const casou = maisParecido(l.nome, candidatos);
    const base = casou ? baseDe.get(casou.ref)! : null;
    const q = base ? quantidadeNaFicha(l, base) : null;
    return {
      original: l.original.trim(),
      titulo: false,
      ref: casou?.ref ?? '',
      qty: q && 'qty' in q ? numero(q.qty) : '',
      motivo: !casou ? 'sem insumo parecido: escolha um (ou desmarque)' : q && 'motivo' in q ? q.motivo : null,
      incluir: true,
    };
  });

  const completas = linhas.filter((l) => !l.titulo && l.ref && l.qty).length;
  const ingredientes = linhas.filter((l) => !l.titulo).length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/receitas" className="text-muted-foreground hover:underline">
            Receitas
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/receitas/${r.id}`} className="text-muted-foreground hover:underline">
            {r.title}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Criar ficha técnica</h1>
        <p className="text-sm text-muted-foreground">
          A app leu os ingredientes da versão {versao?.number} e propôs o insumo e a quantidade de cada
          linha ({completas} de {ingredientes} completas). Reveja antes de criar: medidas como
          &quot;1 lata&quot; ou &quot;2 colheres&quot; não se convertem sozinhas em quilos — escreva o
          peso. A ficha fica ligada a esta receita.
        </p>
      </header>

      {linhas.length === 0 ? (
        <Alert tone="info">Esta receita não tem ingredientes escritos.</Alert>
      ) : null}
      {insumos.length === 0 ? (
        <Alert tone="warning">
          Ainda não há insumos. <Link href="/insumos" className="underline">Registe-os</Link> primeiro.
        </Alert>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Falta um insumo?{' '}
        <Link href="/insumos" target="_blank" className="underline">
          Registe-o noutro separador
        </Link>{' '}
        e recarregue esta página.
      </p>

      <RevisaoFicha
        receitaId={r.id}
        nomeInicial={mesmoNome ? `${r.title} (ficha)` : r.title}
        rendimentoInicial={numero(lerRendimento(versao?.yield) ?? 1)}
        opcoes={opcoes}
        linhas={linhas}
      />
    </div>
  );
}
