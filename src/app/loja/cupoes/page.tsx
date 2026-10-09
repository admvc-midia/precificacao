import Link from 'next/link';
import { Plus, Power } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { alternarCupao, apagarCupao, guardarCupao } from '@/lib/actions/promocoes';
import { diaDaColuna } from '@/lib/cardapio/consultas';
import { diaEmLisboa } from '@/lib/datas';
import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import { currencyOf, formatMoney } from '@/lib/money';
import { descreverCupao, estadoNoDia, type EstadoDaData } from '@/lib/pricing/cardapio';
import { getSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const ESTADO: Record<EstadoDaData, { label: string; variant: 'success' | 'secondary' | 'outline' }> = {
  ativa: { label: 'Válido', variant: 'success' },
  agendada: { label: 'Agendado', variant: 'secondary' },
  terminada: { label: 'Terminado', variant: 'outline' },
  desligada: { label: 'Desligado', variant: 'outline' },
};

const dataCurta = (d: string) => d.split('-').reverse().join('/');
const diaFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeZone: 'UTC' });

export default async function CupoesPage() {
  const [cupoes, fichas, s] = await Promise.all([
    prisma.coupon.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: {
        recipes: { include: { recipe: { select: { name: true } } } },
        orders: {
          orderBy: { dueAt: 'desc' },
          select: {
            id: true,
            number: true,
            status: true,
            dueAt: true,
            couponDiscount: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.recipe.findMany({ where: { kind: 'PRODUCT' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getSettings(),
  ]);
  const currency = currencyOf(s);
  const hoje = diaEmLisboa(new Date());

  const campos = (c?: (typeof cupoes)[number]) => (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código" htmlFor="cu-cod" hint="Letras e números, sem espaços.">
          <Input id="cu-cod" name="code" defaultValue={c?.code ?? ''} required className="uppercase" placeholder="BEMVINDA10" />
        </Field>
        <Field label="Descrição" htmlFor="cu-desc" hint="Só para si.">
          <Input id="cu-desc" name="description" defaultValue={c?.description ?? ''} placeholder="Primeira encomenda" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desconto" htmlFor="cu-tipo">
          <Select id="cu-tipo" name="kind" defaultValue={c?.kind ?? 'PERCENT'}>
            <option value="PERCENT">Percentagem (%)</option>
            <option value="AMOUNT">Valor fixo na encomenda</option>
          </Select>
        </Field>
        <Field label="Quanto" htmlFor="cu-valor" hint="10 = 10% ou 10,00 €.">
          <Input
            id="cu-valor"
            name="value"
            inputMode="decimal"
            required
            defaultValue={
              c ? (c.kind === 'PERCENT' ? String(Math.round(num(c.value) * 10000) / 100) : num(c.value).toFixed(2)).replace('.', ',') : ''
            }
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De" htmlFor="cu-de">
          <Input id="cu-de" name="startsAt" type="date" required defaultValue={c ? diaDaColuna(c.startsAt) : hoje} />
        </Field>
        <Field label="Até (inclusive)" htmlFor="cu-ate" hint="Vazio: sem fim.">
          <Input id="cu-ate" name="endsAt" type="date" defaultValue={c?.endsAt ? diaDaColuna(c.endsAt) : ''} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Encomenda mínima" htmlFor="cu-min">
          <Input id="cu-min" name="minOrder" inputMode="decimal" defaultValue={c?.minOrder == null ? '' : num(c.minOrder).toFixed(2).replace('.', ',')} />
        </Field>
        <Field label="Usos no total" htmlFor="cu-max" hint="Vazio: sem limite.">
          <Input id="cu-max" name="maxUses" inputMode="numeric" defaultValue={c?.maxUses ?? ''} />
        </Field>
        <Field label="Por cliente" htmlFor="cu-cli">
          <Input id="cu-cli" name="maxUsesPerCustomer" inputMode="numeric" defaultValue={c?.maxUsesPerCustomer ?? ''} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Em que produtos</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="todos" defaultChecked={c?.allItems ?? true} />
            Toda a encomenda
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="lista" defaultChecked={c ? !c.allItems : false} />
            Só nestes:
          </label>
        </div>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {fichas.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="recipeId"
                value={f.id}
                defaultChecked={c?.recipes.some((r) => r.recipeId === f.id)}
                className="h-4 w-4"
              />
              {f.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Por ficha técnica: vale também quando a ficha vem dentro de um combo.
        </p>
      </fieldset>
      <input type="hidden" name="stacksWithPromotionsSubmitted" value="1" />
      <input type="hidden" name="activeSubmitted" value="1" />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="stacksWithPromotions" defaultChecked={c?.stacksWithPromotions ?? false} className="h-4 w-4" />
          Junta-se a promoções
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={c?.active ?? true} className="h-4 w-4" />
          Ligado
        </label>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Cupões de desconto
            <AjudaLink secao="cupoes" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O cliente diz o código (ou ele vem na mensagem do cardápio) e aplica-se na nova encomenda,
            onde a app confere a validade, os produtos e os limites.
          </p>
        </div>
        <FormDialog
          action={guardarCupao}
          title="Novo cupão"
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Cupão
            </Button>
          }
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        >
          {campos()}
        </FormDialog>
      </header>

      {cupoes.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há cupões.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {cupoes.map((c) => {
          const estado = estadoNoDia(
            { startsAt: diaDaColuna(c.startsAt), endsAt: c.endsAt ? diaDaColuna(c.endsAt) : null, active: c.active },
            hoje,
          );
          const validas = c.orders.filter((o) => o.status !== 'CANCELLED');
          const descontado = validas.reduce((a, o) => a + (o.couponDiscount == null ? 0 : num(o.couponDiscount)), 0);
          return (
            <Card key={c.id} className={estado === 'terminada' || estado === 'desligada' ? 'opacity-70' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex flex-wrap items-center gap-2 font-mono">
                    {c.code}
                    <Badge variant={ESTADO[estado].variant} className="font-sans">
                      {ESTADO[estado].label}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {descreverCupao({ kind: c.kind, value: num(c.value) }, currency)}
                    {c.allItems ? ' na encomenda' : ` em ${c.recipes.map((r) => r.recipe.name).join(', ')}`}
                    {c.minOrder != null ? ` · mínimo ${formatMoney(num(c.minOrder), currency)}` : ''}
                    {c.stacksWithPromotions ? ' · junta-se a promoções' : ''}
                    <br />
                    De {dataCurta(diaDaColuna(c.startsAt))}
                    {c.endsAt ? ` a ${dataCurta(diaDaColuna(c.endsAt))}` : ', sem fim'}
                    {c.description ? ` · ${c.description}` : ''}
                  </CardDescription>
                </div>
                <div className="flex items-center">
                  <ActionForm action={alternarCupao} showSuccess={false} className="space-y-0">
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title={c.active ? 'Desligar' : 'Ligar'}>
                      <Power className="h-4 w-4" />
                      <span className="sr-only">{c.active ? 'Desligar' : 'Ligar'}</span>
                    </Button>
                  </ActionForm>
                  <FormDialog action={guardarCupao} title={c.code} className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    {campos(c)}
                  </FormDialog>
                  <ConfirmDelete
                    action={apagarCupao}
                    fields={{ id: c.id }}
                    title={`Apagar o cupão ${c.code}?`}
                    description="As encomendas que o usaram guardam o código e o desconto."
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Usado {validas.length}
                  {c.maxUses != null ? ` de ${c.maxUses}` : ''} {validas.length === 1 ? 'vez' : 'vezes'}
                  {c.maxUsesPerCustomer != null ? ` · até ${c.maxUsesPerCustomer} por cliente` : ''}
                  {descontado > 0 ? ` · ${formatMoney(descontado, currency)} descontados` : ''}
                </p>
                {c.orders.length ? (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">Encomendas</summary>
                    <ul className="mt-2 space-y-1">
                      {c.orders.map((o) => (
                        <li key={o.id} className="flex justify-between gap-2">
                          <Link href={`/encomendas/${o.id}`} className="hover:underline">
                            #{o.number} {o.customer?.name ?? 'sem cliente'} · {diaFmt.format(o.dueAt)}
                            {o.status === 'CANCELLED' ? ' (cancelada)' : ''}
                          </Link>
                          <span className="tabular-nums">
                            {o.couponDiscount != null ? `−${formatMoney(num(o.couponDiscount), currency)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
