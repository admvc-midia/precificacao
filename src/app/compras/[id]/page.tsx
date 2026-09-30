import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';

import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import {
  ListaViva,
  type ItemCatalogo,
  type ItemLista,
  type Loja,
  type OrdemAberta,
} from '@/components/compras/lista-viva';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { deleteShoppingList, renameShoppingList } from '@/lib/actions/shopping';
import { prisma } from '@/lib/db';
import { num, numOrNull } from '@/lib/mappers';
import { precoPorBase } from '@/lib/pricing/compras';
import { getCurrencyConfig } from '@/lib/queries';
import { toBase, toDisplay } from '@/lib/units';

export const dynamic = 'force-dynamic';

/** Janela do "para quantos dias chega": o ultimo mes de saidas. */
const DIAS_DE_HISTORICO = 30;

/** Gasto medio por dia de cada insumo, pelas saidas do ultimo mes. */
async function gastoPorDia(): Promise<Map<string, number>> {
  const desde = new Date(Date.now() - DIAS_DE_HISTORICO * 24 * 3600 * 1000);
  const grupos = await prisma.stockMovement.groupBy({
    by: ['ingredientId'],
    where: { kind: { in: ['PRODUCTION', 'WASTE', 'PROMO'] }, occurredAt: { gte: desde } },
    _sum: { qtyBase: true },
  });
  return new Map(
    grupos.map((g) => [g.ingredientId, Math.abs(num(g._sum.qtyBase)) / DIAS_DE_HISTORICO]),
  );
}

export default async function ListaDeComprasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lista = await prisma.shoppingList.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          ingredient: { select: { name: true, baseUnit: true, stockBase: true, minStockBase: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!lista) notFound();

  const aberta = lista.closedAt === null;
  const [currency, lojasRows, insumos, ordens, gasto] = await Promise.all([
    getCurrencyConfig(),
    prisma.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, address: true } }),
    aberta
      ? prisma.ingredient.findMany({
          include: {
            offers: {
              where: { active: true },
              include: { supplier: { select: { name: true } } },
            },
          },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    aberta
      ? prisma.productionOrder.findMany({
          where: { receivedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true },
          take: 30,
        })
      : Promise.resolve([]),
    aberta ? gastoPorDia() : Promise.resolve(new Map<string, number>()),
  ]);

  // Tudo em numeros simples e na unidade de exibicao (kg, L, un): o
  // componente e de cliente, e Decimal nao atravessa a fronteira.
  const itens: ItemLista[] = lista.items.map((i) => {
    const base = i.ingredient.baseUnit;
    return {
      id: i.id,
      ingredientId: i.ingredientId,
      name: i.ingredient.name,
      baseUnit: base,
      packs: num(i.packs),
      supplierId: i.supplierId,
      supplierName: i.supplier?.name ?? null,
      price: num(i.price),
      packQtyDisplay: toDisplay(toBase(num(i.packQty), i.packUnit), base),
      status: i.status,
      useAsCurrent: i.useAsCurrent,
      note: i.note,
      refPricePerBase: numOrNull(i.refPricePerBase),
      stockBase: num(i.ingredient.stockBase),
      minStockBase: numOrNull(i.ingredient.minStockBase),
    };
  });

  const catalogo: ItemCatalogo[] = insumos.map((ins) => {
    const base = ins.baseUnit;
    const oferta = (o: (typeof ins.offers)[number]) => ({
      supplierId: o.supplierId,
      supplierName: o.supplier?.name ?? null,
      price: num(o.purchasePrice),
      packQtyDisplay: toDisplay(toBase(num(o.purchaseQty), o.purchaseUnit), base),
      perBase: precoPorBase({
        price: num(o.purchasePrice),
        packQty: num(o.purchaseQty),
        packUnit: o.purchaseUnit,
      }),
      inUse: o.inUse,
    });
    const emUso = ins.offers.find((o) => o.inUse);
    return {
      id: ins.id,
      name: ins.name,
      baseUnit: base,
      stockBase: num(ins.stockBase),
      minStockBase: numOrNull(ins.minStockBase),
      gastoPorDia: gasto.get(ins.id) ?? 0,
      emUso: emUso
        ? oferta(emUso)
        : {
            // Insumo sem lista de precos (anterior aos precos por fornecedor):
            // o preco que esta no proprio insumo e o que vale.
            supplierId: ins.supplierId,
            supplierName: null,
            price: num(ins.purchasePrice),
            packQtyDisplay: toDisplay(toBase(num(ins.purchaseQty), ins.purchaseUnit), base),
            perBase: precoPorBase({
              price: num(ins.purchasePrice),
              packQty: num(ins.purchaseQty),
              packUnit: ins.purchaseUnit,
            }),
            inUse: true,
          },
      ofertas: ins.offers.map(oferta).sort((a, b) => (a.perBase ?? 0) - (b.perBase ?? 0)),
    };
  });

  const lojas: Loja[] = lojasRows;
  const ordensAbertas: OrdemAberta[] = ordens;
  const fechadaEm = lista.closedAt
    ? new Intl.DateTimeFormat(currency.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        lista.closedAt,
      )
    : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            <Link href="/compras" className="hover:underline">
              Compras
            </Link>{' '}
            /
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lista.name}
            <AjudaLink secao="compras" />
          </h1>
          {fechadaEm ? (
            <p className="text-sm text-muted-foreground">
              Fechada em {fechadaEm}. O que foi comprado ja deu entrada no estoque.
            </p>
          ) : null}
        </div>
        {aberta ? (
          <div className="flex items-center gap-1">
            <FormDialog
              action={renameShoppingList}
              title="Mudar o nome"
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Mudar o nome</span>
                </Button>
              }
            >
              <input type="hidden" name="id" value={lista.id} />
              <Field label="Nome" htmlFor="nome-lista">
                <Input id="nome-lista" name="name" defaultValue={lista.name} required />
              </Field>
            </FormDialog>
            <ConfirmDelete
              action={deleteShoppingList}
              fields={{ id: lista.id }}
              title="Apagar esta lista?"
              description="Os itens vao com ela. Nada entrou no estoque, por isso nada mais muda."
              confirmLabel="Apagar lista"
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Apagar lista</span>
                </Button>
              }
            />
          </div>
        ) : null}
      </header>

      <ListaViva
        listId={lista.id}
        listName={lista.name}
        aberta={aberta}
        itens={itens}
        catalogo={catalogo}
        lojas={lojas}
        ordens={ordensAbertas}
        currency={currency}
      />
    </div>
  );
}
