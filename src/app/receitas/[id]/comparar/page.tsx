import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SubmitButton } from '@/components/action-form';
import { CampoDiff, DiffView } from '@/components/livro/diff-view';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { diffLinhas, resumo } from '@/lib/livro/diff';
import { detalheReceita } from '@/lib/livro/consultas';
import { linhas, passos } from '@/lib/livro/receita';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const dataFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' });

function nomeDa(n: number) {
  return n === 1 ? 'Original' : `Versão ${n}`;
}

export default async function CompararPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; para?: string }>;
}) {
  await exigirSessao();
  const { id } = await params;
  const sp = await searchParams;
  const r = await detalheReceita(id);
  if (!r) notFound();

  const porNumero = new Map(r.versions.map((v) => [v.number, v]));
  const a = porNumero.get(Number(sp.de)) ?? r.versions[r.versions.length - 1];
  const b = porNumero.get(Number(sp.para)) ?? porNumero.get(r.currentVersion) ?? r.versions[0];

  const ingr = diffLinhas(linhas(a.ingredients), linhas(b.ingredients));
  const prep = diffLinhas(passos(a.steps), passos(b.steps));
  const notas = diffLinhas(linhas(a.notes ?? ''), linhas(b.notes ?? ''));
  const ri = resumo(ingr);
  const rp = resumo(prep);

  const cabeca = (v: typeof a) => (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        {nomeDa(v.number)}
        {v.number === r.currentVersion ? <Badge variant="success">em uso</Badge> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        {dataFmt.format(v.createdAt)} · {v.authorName}
      </p>
      {v.changeNote && v.number > 1 ? <p className="mt-1 text-xs italic">“{v.changeNote}”</p> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/receitas" className="hover:underline">
            Receitas
          </Link>
          <span>/</span>
          <Link href={`/receitas/${r.id}`} className="hover:underline">
            {r.title}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">O que mudou</h1>
      </header>

      {/* Escolher as duas versoes: GET, o link guarda a comparacao. */}
      <form className="flex flex-wrap items-end gap-2">
        <Field label="De" htmlFor="de">
          <Select id="de" name="de" defaultValue={String(a.number)} className="w-40">
            {[...r.versions].reverse().map((v) => (
              <option key={v.number} value={v.number}>
                {nomeDa(v.number)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para" htmlFor="para">
          <Select id="para" name="para" defaultValue={String(b.number)} className="w-40">
            {[...r.versions].reverse().map((v) => (
              <option key={v.number} value={v.number}>
                {nomeDa(v.number)}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="outline">Comparar</SubmitButton>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {cabeca(a)}
        {cabeca(b)}
      </div>

      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-mono">−</span> saiu (riscado, vermelho)
        </span>
        <span>
          <span className="font-mono">+</span> entrou (verde)
        </span>
        <span>
          <span className="font-mono">~</span> mudou (só as palavras alteradas com cor)
        </span>
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Rendimento e tempo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <CampoDiff rotulo="Rendimento" antes={a.yield} depois={b.yield} />
          <CampoDiff rotulo="Tempo" antes={a.prepTime} depois={b.prepTime} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Ingredientes{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {ri.mudaram + ri.entraram + ri.sairam === 0
                  ? '— iguais'
                  : `— ${ri.mudaram} mudaram, ${ri.entraram} entraram, ${ri.sairam} saíram`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DiffView linhas={ingr} vazio="Sem ingredientes." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              Modo de preparo{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {rp.mudaram + rp.entraram + rp.sairam === 0
                  ? '— igual'
                  : `— ${rp.mudaram} passos mudaram, ${rp.entraram} entraram, ${rp.sairam} saíram`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DiffView linhas={prep} vazio="Sem passos." />
          </CardContent>
        </Card>
      </div>

      {notas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas e dicas</CardTitle>
          </CardHeader>
          <CardContent>
            <DiffView linhas={notas} vazio="Sem notas." />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
