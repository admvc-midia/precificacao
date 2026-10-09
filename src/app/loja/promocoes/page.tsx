import Link from 'next/link';
import { Plus, Power } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { CamposPromocao } from '@/components/cardapio/campos-promocao';
import { Alert, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { alternarPromocao, apagarPromocao, guardarPromocao } from '@/lib/actions/promocoes';
import { promocaoInput } from '@/lib/cardapio/consultas';
import { diaEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  descreverPromocao,
  estadoNoDia,
  totalComPromocao,
  type EstadoDaData,
  type PromocaoInput,
} from '@/lib/pricing/cardapio';
import { getCostedRecipes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const ESTADO: Record<EstadoDaData, { label: string; variant: 'success' | 'secondary' | 'outline' | 'warning' }> = {
  ativa: { label: 'Ativa', variant: 'success' },
  agendada: { label: 'Agendada', variant: 'secondary' },
  terminada: { label: 'Terminada', variant: 'outline' },
  desligada: { label: 'Desligada', variant: 'outline' },
};
const ORDEM: EstadoDaData[] = ['ativa', 'agendada', 'desligada', 'terminada'];

const dataCurta = (d: string) => d.split('-').reverse().join('/');

/** A quantidade que mostra a promocao a funcionar: 1, um lote, ou o minimo. */
function qtdDeExemplo(p: PromocaoInput): number {
  if (p.kind === 'BUY_X_PAY_Y') return p.buyQty ?? 1;
  if (p.kind === 'QTY_PRICE') return p.minQty ?? 1;
  return 1;
}

export default async function PromocoesPage() {
  const [promos, itens, { recipes, settings, currency }] = await Promise.all([
    prisma.promotion.findMany({
      orderBy: [{ startsAt: 'desc' }],
      include: { items: { select: { menuItemId: true } }, _count: { select: { orderLines: true } } },
    }),
    prisma.menuItem.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        section: { select: { name: true, position: true } },
        recipe: { select: { name: true } },
        components: { select: { recipeId: true, qty: true } },
      },
    }),
    getCostedRecipes(),
  ]);
  const hoje = diaEmLisboa(new Date());

  const custo = new Map(recipes.map((r) => [r.id, r.cost ? r.cost.foodCostPerUnit + r.cost.packagingCost : null]));
  const nomeDe = (i: (typeof itens)[number]) => i.name || i.recipe?.name || 'Sem nome';
  const porId = new Map(itens.map((i) => [i.id, i]));
  /** Custo direto de uma unidade do item; nulo se nao se sabe. */
  const custoDe = (i: (typeof itens)[number]): number | null => {
    if (i.recipeId) return custo.get(i.recipeId) ?? null;
    if (i.kind === 'COMBO' && i.components.length) {
      let t = 0;
      for (const c of i.components) {
        const u = custo.get(c.recipeId);
        if (u == null) return null;
        t += u * num(c.qty);
      }
      return t;
    }
    return null;
  };
  const liquido = (v: number) => (settings.vatMode === 'INCLUDED' ? v / (1 + settings.vatRate) : v);

  const lista = promos
    .map((p) => ({ row: p, p: promocaoInput(p) }))
    .map((x) => ({ ...x, estado: estadoNoDia(x.p, hoje) }))
    .sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado));

  // Para o formulario: os itens agrupados pela secao.
  const grupos = new Map<string, Array<{ id: string; nome: string }>>();
  for (const i of [...itens].sort((a, b) => (a.section?.position ?? 999) - (b.section?.position ?? 999))) {
    const g = i.section?.name ?? 'Sem secção';
    grupos.set(g, [...(grupos.get(g) ?? []), { id: i.id, nome: nomeDe(i) }]);
  }

  const campos = (row?: (typeof promos)[number]) => (
    <>
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <Field label="Nome" htmlFor="pr-nome" hint="Para si e para a encomenda; o cliente vê o desconto.">
        <Input id="pr-nome" name="name" defaultValue={row?.name ?? ''} required placeholder="Dia da Mãe" />
      </Field>
      <CamposPromocao
        inicial={
          row
            ? {
                kind: row.kind,
                value:
                  row.value == null
                    ? ''
                    : row.kind === 'PERCENT'
                      ? String(Math.round(num(row.value) * 10000) / 100).replace('.', ',')
                      : num(row.value).toFixed(2).replace('.', ','),
                buyQty: row.buyQty?.toString() ?? '',
                payQty: row.payQty?.toString() ?? '',
                minQty: row.minQty == null ? '' : String(num(row.minQty)).replace('.', ','),
              }
            : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="De" htmlFor="pr-de">
          <Input id="pr-de" name="startsAt" type="date" defaultValue={row ? row.startsAt.toISOString().slice(0, 10) : hoje} required />
        </Field>
        <Field label="Até (inclusive)" htmlFor="pr-ate" hint="Vazio: sem fim.">
          <Input id="pr-ate" name="endsAt" type="date" defaultValue={row?.endsAt?.toISOString().slice(0, 10) ?? ''} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Em que itens do cardápio</legend>
        {[...grupos].map(([g, its]) => (
          <div key={g} className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">{g}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {its.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="menuItemId"
                    value={i.id}
                    defaultChecked={row?.items.some((x) => x.menuItemId === i.id)}
                    className="h-4 w-4"
                  />
                  {i.nome}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <input type="hidden" name="activeSubmitted" value="1" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={row?.active ?? true} className="h-4 w-4" />
        Ligada
      </label>
    </>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Promoções
            <AjudaLink secao="promocoes" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Aparecem no link público (preço riscado ou etiqueta) e entram sozinhas na nova encomenda,
            pelo dia da entrega. Várias no mesmo item não se somam: vale a mais barata para o cliente.
          </p>
        </div>
        {itens.length ? (
          <FormDialog
            action={guardarPromocao}
            title="Nova promoção"
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Promoção
              </Button>
            }
            className="max-h-[90vh] overflow-y-auto"
          >
            {campos()}
          </FormDialog>
        ) : null}
      </header>

      {itens.length === 0 ? (
        <Alert tone="info">
          As promoções aplicam-se a itens do cardápio.{' '}
          <Link href="/loja/cardapio" className="underline">
            Monte o cardápio
          </Link>{' '}
          primeiro.
        </Alert>
      ) : null}

      {lista.length === 0 && itens.length ? (
        <p className="text-sm text-muted-foreground">Ainda não há promoções.</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {lista.map(({ row, p, estado }) => (
          <Card key={row.id} className={estado === 'terminada' || estado === 'desligada' ? 'opacity-70' : undefined}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {row.name}
                  <Badge variant={ESTADO[estado].variant}>{ESTADO[estado].label}</Badge>
                </CardTitle>
                <CardDescription>
                  {descreverPromocao(p, currency)} · de {dataCurta(p.startsAt)}
                  {p.endsAt ? ` a ${dataCurta(p.endsAt)}` : ', sem fim'}
                  {row._count.orderLines ? ` · usada em ${row._count.orderLines} linha(s) de encomenda` : ''}
                </CardDescription>
              </div>
              <div className="flex items-center">
                <ActionForm action={alternarPromocao} showSuccess={false} className="space-y-0">
                  <input type="hidden" name="id" value={row.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title={row.active ? 'Desligar' : 'Ligar'}>
                    <Power className="h-4 w-4" />
                    <span className="sr-only">{row.active ? 'Desligar' : 'Ligar'}</span>
                  </Button>
                </ActionForm>
                <FormDialog action={guardarPromocao} title={row.name} className="max-h-[90vh] overflow-y-auto">
                  {campos(row)}
                </FormDialog>
                <ConfirmDelete
                  action={apagarPromocao}
                  fields={{ id: row.id }}
                  title={`Apagar a promoção ${row.name}?`}
                  description="As encomendas que a usaram ficam com o preço que tiveram."
                />
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {p.menuItemIds.map((id) => {
                  const i = porId.get(id);
                  if (!i) return null;
                  const preco = num(i.price);
                  const q = qtdDeExemplo(p);
                  const total = totalComPromocao(p, preco, q);
                  const c = custoDe(i);
                  const cmv = total && c != null ? (c * q) / liquido(total) : null;
                  const alvo = settings.targetCmv;
                  return (
                    <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>{nomeDe(i)}</span>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">
                        {total != null ? (
                          <>
                            {q > 1 ? `${q} un.: ` : ''}
                            <span className="line-through">{formatMoney(preco * q, currency)}</span>{' '}
                            <span className="font-medium text-foreground">{formatMoney(total, currency)}</span>
                          </>
                        ) : null}
                        {cmv != null ? (
                          <span className={cmv > alvo ? ' font-medium text-amber-700 dark:text-amber-400' : ''}>
                            {' '}
                            · CMV {formatPercent(cmv, currency.locale, 0)}
                            {cmv > alvo ? ` (alvo ${formatPercent(alvo, currency.locale, 0)})` : ''}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
