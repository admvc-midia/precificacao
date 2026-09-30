'use client';

/**
 * A lista de compras do comprador, dentro do supermercado.
 *
 * Como a checklist da producao, e para usar de pe, com uma mao: a linha
 * inteira e o alvo de toque, o riscado esvanece mas nao some, e o topo diz
 * sempre quanto falta. A diferenca e que aqui cada toque vai ao servidor —
 * a lista e partilhada (o dono ve o progresso), e e ela que da entrada no
 * estoque ao fechar. O toque responde logo (`useOptimistic`); se o servidor
 * recusar, a linha volta ao que era e a mensagem aparece.
 *
 * O painel "Juntar insumo / achei mais barato" e o outro meio do ecra: o
 * comprador escolhe um insumo, ve o estoque, o minimo, para quantos dias
 * chega e o preco que a casa usa; escreve o preco que esta a ver, e a
 * comparacao aparece enquanto escreve.
 */

import { useActionState, useMemo, useOptimistic, useState, useTransition } from 'react';
import {
  AlertTriangle,
  BellRing,
  Check,
  ClipboardList,
  PackageCheck,
  Plus,
  Search,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog, SubmitButton } from '@/components/action-form';
import { Paginacao } from '@/components/paginacao';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { QtyInput } from '@/components/ui/qty-input';
import {
  addBelowMinimum,
  addFromOrder,
  addShoppingItem,
  closeShoppingList,
  removeShoppingItem,
  setShoppingItemStatus,
  updateShoppingItem,
} from '@/lib/actions/shopping';
import type { ActionState } from '@/lib/actions/shared';
import { formatMoney, parseDecimal, type CurrencyConfig } from '@/lib/money';
import { pagina } from '@/lib/paginacao';
import { compararPreco, lerEstoque, type Comparacao } from '@/lib/pricing/compras';
import {
  DISPLAY_UNIT_LABEL,
  displayUnitOf,
  formatBaseQty,
  formatCostPerUnit,
  fromDisplay,
  type BaseUnit,
} from '@/lib/units';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Dados que o servidor manda
// ---------------------------------------------------------------------------

export type Estado = 'PENDING' | 'BOUGHT' | 'MISSING';

export interface ItemLista {
  id: string;
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  packs: number;
  supplierId: string | null;
  supplierName: string | null;
  /** Preco da embalagem. */
  price: number;
  /** Tamanho da embalagem em kg, L ou un. */
  packQtyDisplay: number;
  status: Estado;
  useAsCurrent: boolean;
  note: string | null;
  refPricePerBase: number | null;
  stockBase: number;
  minStockBase: number | null;
}

export interface OfertaCatalogo {
  supplierId: string | null;
  supplierName: string | null;
  price: number;
  packQtyDisplay: number;
  perBase: number | null;
  inUse: boolean;
}

export interface ItemCatalogo {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  stockBase: number;
  minStockBase: number | null;
  gastoPorDia: number;
  emUso: OfertaCatalogo;
  /** Do mais barato por kg para o mais caro. */
  ofertas: OfertaCatalogo[];
}

export interface Loja {
  id: string;
  name: string;
  address: string | null;
}

export interface OrdemAberta {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------

const ITENS_POR_LOJA = 15;
const SEM_LOJA = 'Sem loja definida';

/** Numero para dentro de um campo: virgula, sem milhares, sem zeros a mais. */
function campo(n: number): string {
  return Number.isFinite(n) ? String(Number(n.toFixed(4))).replace('.', ',') : '';
}

function perBaseDoItem(i: Pick<ItemLista, 'price' | 'packQtyDisplay' | 'baseUnit'>): number | null {
  const base = fromDisplay(i.packQtyDisplay, i.baseUnit);
  return base > 0 ? i.price / base : null;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------

export function ListaViva({
  listId,
  listName,
  aberta,
  itens,
  catalogo,
  lojas,
  ordens,
  currency,
}: {
  listId: string;
  listName: string;
  aberta: boolean;
  itens: ItemLista[];
  catalogo: ItemCatalogo[];
  lojas: Loja[];
  ordens: OrdemAberta[];
  currency: CurrencyConfig;
}) {
  const [otimista, marcar] = useOptimistic(
    itens,
    (atual: ItemLista[], m: { id: string; status: Estado }) =>
      atual.map((i) => (i.id === m.id ? { ...i, status: m.status } : i)),
  );
  const [, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState(itens.length === 0 && aberta);

  function mudarEstado(id: string, status: Estado) {
    setErro(null);
    startTransition(async () => {
      marcar({ id, status });
      const f = new FormData();
      f.set('id', id);
      f.set('status', status);
      const r = await setShoppingItemStatus({ ok: true }, f);
      if (!r.ok) setErro(r.message ?? 'Nao foi possivel gravar.');
    });
  }

  const contam = otimista.filter((i) => i.status !== 'MISSING');
  const comprados = otimista.filter((i) => i.status === 'BOUGHT');
  const previsto = contam.reduce((a, i) => a + i.packs * i.price, 0);
  const noCarrinho = comprados.reduce((a, i) => a + i.packs * i.price, 0);
  const porComprar = otimista.filter((i) => i.status === 'PENDING').length;
  const naoHavia = otimista.length - contam.length;

  // Por loja, na ordem alfabetica; "sem loja" no fim.
  const grupos = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; itens: ItemLista[] }>();
    for (const i of otimista) {
      const k = i.supplierId ?? 'sem';
      if (!m.has(k)) m.set(k, { id: k, nome: i.supplierName ?? SEM_LOJA, itens: [] });
      m.get(k)!.itens.push(i);
    }
    return [...m.values()].sort((a, b) =>
      a.id === 'sem' ? 1 : b.id === 'sem' ? -1 : a.nome.localeCompare(b.nome),
    );
  }, [otimista]);

  return (
    <div className="space-y-4">
      {/* Progresso: colado ao topo, e o que se consulta a meio da volta. */}
      <div className="sticky top-14 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {comprados.length} de {contam.length} no carrinho
              {naoHavia > 0 ? (
                <span className="font-normal text-muted-foreground"> · {naoHavia} nao havia</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              no carrinho <strong className="tabular-nums">{formatMoney(noCarrinho, currency)}</strong>{' '}
              de {formatMoney(previsto, currency)} previstos
            </p>
          </div>
          {aberta ? (
            <FecharCompra
              listId={listId}
              comprados={comprados.length}
              total={formatMoney(noCarrinho, currency)}
              porComprar={porComprar}
              naoHavia={naoHavia}
            />
          ) : null}
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={comprados.length}
          aria-valuemin={0}
          aria-valuemax={contam.length}
          aria-label="Itens no carrinho"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${contam.length ? (comprados.length / contam.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {erro ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {erro}
        </p>
      ) : null}

      {aberta ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={painel ? 'secondary' : 'default'}
            onClick={() => setPainel((v) => !v)}
            aria-expanded={painel}
          >
            {painel ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {painel ? 'Fechar painel' : 'Juntar insumo / achei mais barato'}
          </Button>
          <ActionForm action={addBelowMinimum} className="space-y-2">
            <input type="hidden" name="listId" value={listId} />
            <SubmitButton variant="outline" pendingLabel="A juntar…">
              <BellRing className="h-4 w-4" />
              Juntar o que esta abaixo do minimo
            </SubmitButton>
          </ActionForm>
          {ordens.length > 0 ? <DeUmaProducao listId={listId} ordens={ordens} /> : null}
        </div>
      ) : null}

      {aberta && painel ? (
        <PainelAdicionar listId={listId} catalogo={catalogo} lojas={lojas} currency={currency} />
      ) : null}

      {otimista.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Lista vazia. Junte insumos com o botao acima.
        </p>
      ) : (
        grupos.map((g) => (
          <GrupoLoja
            key={g.id}
            nome={g.nome}
            itens={g.itens}
            aberta={aberta}
            lojas={lojas}
            currency={currency}
            onEstado={mudarEstado}
          />
        ))
      )}

      {!aberta ? null : (
        <p className="text-xs text-muted-foreground">
          Riscar nao mexe no estoque: so <strong>Fechar compra</strong> da entrada, ao preco
          pago. Lista: {listName}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uma loja
// ---------------------------------------------------------------------------

function GrupoLoja({
  nome,
  itens,
  aberta,
  lojas,
  currency,
  onEstado,
}: {
  nome: string;
  itens: ItemLista[];
  aberta: boolean;
  lojas: Loja[];
  currency: CurrencyConfig;
  onEstado: (id: string, status: Estado) => void;
}) {
  const [pedida, setPedida] = useState(1);
  const p = pagina(itens.length, ITENS_POR_LOJA, pedida);
  const total = itens
    .filter((i) => i.status !== 'MISSING')
    .reduce((a, i) => a + i.packs * i.price, 0);
  const porFazer = itens.filter((i) => i.status === 'PENDING').length;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{nome}</span>
          {porFazer === 0 ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="loja completa" />
          ) : null}
        </p>
        <span className="shrink-0 font-medium tabular-nums">{formatMoney(total, currency)}</span>
      </div>
      <ul className="divide-y">
        {itens.slice(p.inicio, p.fim).map((i) => (
          <LinhaItem
            key={i.id}
            item={i}
            aberta={aberta}
            lojas={lojas}
            currency={currency}
            onEstado={onEstado}
          />
        ))}
      </ul>
      <Paginacao p={p} onChange={setPedida} className="border-t px-4 py-2" />
    </section>
  );
}

function TextoDiferenca({ c }: { c: Comparacao | null }) {
  if (!c || c.diferenca === null || c.veredicto === 'igual') return null;
  const pct = Math.round(Math.abs(c.diferenca) * 100);
  return c.veredicto === 'mais-barato' ? (
    <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      {pct}% mais barato
    </Badge>
  ) : (
    <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      {pct}% mais caro
    </Badge>
  );
}

function LinhaItem({
  item,
  aberta,
  lojas,
  currency,
  onEstado,
}: {
  item: ItemLista;
  aberta: boolean;
  lojas: Loja[];
  currency: CurrencyConfig;
  onEstado: (id: string, status: Estado) => void;
}) {
  const feito = item.status === 'BOUGHT';
  const faltou = item.status === 'MISSING';
  const unidade = displayUnitOf(item.baseUnit);
  const perBase = perBaseDoItem(item);
  const comp = compararPreco(
    { price: item.price, packQty: item.packQtyDisplay, packUnit: unidade },
    item.refPricePerBase,
  );
  const embalagem = formatBaseQty(fromDisplay(item.packQtyDisplay, item.baseUnit), item.baseUnit, currency);

  const conteudo = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={cn('font-medium', (feito || faltou) && 'text-muted-foreground line-through')}>
          {item.name}
        </span>
        <span className={cn('shrink-0 tabular-nums', feito || faltou ? 'text-muted-foreground' : 'font-medium')}>
          {formatMoney(item.packs * item.price, currency)}
        </span>
      </div>
      <p className="mt-0.5 text-sm">
        {campo(item.packs)}× {embalagem}{' '}
        <span className="text-muted-foreground">
          a {formatMoney(item.price, currency)}
          {perBase !== null ? ` · ${formatCostPerUnit(perBase, item.baseUnit, currency)}` : ''}
        </span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {faltou ? <Badge variant="secondary">Nao havia</Badge> : null}
        <TextoDiferenca c={comp} />
        {item.useAsCurrent ? <Badge variant="secondary">vai passar a preco em uso</Badge> : null}
        {item.note ? <span>{item.note}</span> : null}
      </div>
    </div>
  );

  if (!aberta) {
    return (
      <li className={cn('flex items-start gap-3 px-4 py-3', !feito && 'opacity-60')}>
        {feito ? (
          <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="comprado" />
        ) : (
          <X className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="nao comprado" />
        )}
        {conteudo}
      </li>
    );
  }

  return (
    <li className={cn('flex items-start gap-1 pr-2', (feito || faltou) && 'bg-muted/30')}>
      {/* A linha inteira risca — um quadradinho de 16px nao se acerta com o
          polegar a andar. Tocar num "nao havia" mete-o no carrinho: afinal havia. */}
      <label className="flex min-h-16 flex-1 cursor-pointer items-start gap-3 py-3 pl-4 transition-colors hover:bg-accent/40">
        <input
          type="checkbox"
          checked={feito}
          onChange={() => onEstado(item.id, feito ? 'PENDING' : 'BOUGHT')}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-primary"
          aria-label={`${item.name}: ${feito ? 'no carrinho' : 'por comprar'}`}
        />
        {conteudo}
      </label>
      <div className="flex shrink-0 flex-col items-center py-2">
        <EditarItem item={item} lojas={lojas} />
        {!feito ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={faltou ? 'Afinal havia' : 'Nao havia'}
            onClick={() => onEstado(item.id, faltou ? 'PENDING' : 'MISSING')}
            className="text-muted-foreground"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="sr-only">{faltou ? 'Afinal havia' : 'Nao havia'}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Corrigir um item
// ---------------------------------------------------------------------------

function CampoLoja({
  lojas,
  inicial,
  id,
}: {
  lojas: Loja[];
  inicial: string | null;
  id: string;
}) {
  const [valor, setValor] = useState(inicial ?? '');
  return (
    <div className="space-y-2">
      <Select id={id} name="supplierId" value={valor} onChange={(e) => setValor(e.target.value)}>
        <option value="">{SEM_LOJA}</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
        <option value="novo">Outra loja…</option>
      </Select>
      {valor === 'novo' ? (
        <Input name="newSupplierName" placeholder="Nome da loja (ex.: Lidl Benfica)" required autoFocus />
      ) : null}
    </div>
  );
}

function EditarItem({ item, lojas }: { item: ItemLista; lojas: Loja[] }) {
  const unidade = displayUnitOf(item.baseUnit);
  return (
    <div className="flex">
      <FormDialog
        action={updateShoppingItem}
        title={item.name}
        description="Corrija o que for diferente no supermercado. O preco novo fica registado para a loja ao fechar a compra."
      >
        <input type="hidden" name="id" value={item.id} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Embalagens" htmlFor={`packs-${item.id}`}>
            <Input id={`packs-${item.id}`} name="packs" inputMode="decimal" defaultValue={campo(item.packs)} />
          </Field>
          <Field label="Preco da embalagem" htmlFor={`price-${item.id}`}>
            <Input id={`price-${item.id}`} name="price" inputMode="decimal" defaultValue={campo(item.price)} />
          </Field>
        </div>
        <Field label="Tamanho da embalagem" htmlFor={`qty-${item.id}`}>
          <QtyInput
            id={`qty-${item.id}`}
            name="packQty"
            unitLabel={DISPLAY_UNIT_LABEL[item.baseUnit]}
            unitName="packUnit"
            unitValue={unidade}
            defaultValue={campo(item.packQtyDisplay)}
          />
        </Field>
        <Field label="Loja" htmlFor={`loja-${item.id}`}>
          <CampoLoja lojas={lojas} inicial={item.supplierId} id={`loja-${item.id}`} />
        </Field>
        <input type="hidden" name="useAsCurrentSent" value="1" />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="useAsCurrent"
            value="1"
            defaultChecked={item.useAsCurrent}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            Usar este preco daqui para a frente
            <span className="block text-xs text-muted-foreground">
              Muda o custo das fichas que usam este insumo. Sem isto, o preco fica so
              registado para a loja.
            </span>
          </span>
        </label>
        <Field label="Nota" htmlFor={`nota-${item.id}`}>
          <Input id={`nota-${item.id}`} name="note" defaultValue={item.note ?? ''} placeholder="Opcional" />
        </Field>
      </FormDialog>
      <ConfirmDelete
        action={removeShoppingItem}
        fields={{ id: item.id }}
        title={`Tirar "${item.name}" da lista?`}
        confirmLabel="Tirar"
        trigger={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Tirar da lista</span>
          </Button>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Juntar da producao
// ---------------------------------------------------------------------------

function DeUmaProducao({ listId, ordens }: { listId: string; ordens: OrdemAberta[] }) {
  return (
    <FormDialog
      action={addFromOrder}
      title="Juntar de uma producao"
      description="Copia para esta lista o que a ordem manda comprar. De entrada no estoque por aqui ou pelo 'Recebi esta compra' da ordem — nao pelos dois."
      submitLabel="Juntar"
      trigger={
        <Button type="button" variant="outline">
          <ClipboardList className="h-4 w-4" />
          De uma producao
        </Button>
      }
    >
      <input type="hidden" name="listId" value={listId} />
      <Field label="Ordem de producao" htmlFor="orderId">
        <Select id="orderId" name="orderId" defaultValue={ordens[0]?.id}>
          {ordens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Fechar
// ---------------------------------------------------------------------------

function FecharCompra({
  listId,
  comprados,
  total,
  porComprar,
  naoHavia,
}: {
  listId: string;
  comprados: number;
  total: string;
  porComprar: number;
  naoHavia: number;
}) {
  const fora = [
    porComprar > 0 ? `${porComprar} por comprar` : null,
    naoHavia > 0 ? `${naoHavia} "nao havia"` : null,
  ].filter(Boolean);
  return (
    <FormDialog
      action={closeShoppingList}
      title="Fechar a compra?"
      description={`${comprados} item(ns) riscados entram no estoque, ao preco pago (${total}), e os precos ficam registados para as lojas.${
        fora.length ? ` Ficam de fora: ${fora.join(' e ')}.` : ''
      } Depois de fechada, a lista ja nao se edita.`}
      submitLabel="Fechar e dar entrada"
      trigger={
        <Button type="button" size="sm" disabled={comprados === 0} className="shrink-0">
          <PackageCheck className="h-4 w-4" />
          Fechar compra
        </Button>
      }
    >
      <input type="hidden" name="id" value={listId} />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Juntar um insumo / achei mais barato
// ---------------------------------------------------------------------------

const MAX_RESULTADOS = 8;

function PainelAdicionar({
  listId,
  catalogo,
  lojas,
  currency,
}: {
  listId: string;
  catalogo: ItemCatalogo[];
  lojas: Loja[];
  currency: CurrencyConfig;
}) {
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<ItemCatalogo | null>(null);
  const [preco, setPreco] = useState('');
  const [tamanho, setTamanho] = useState('');
  const [versao, setVersao] = useState(0);

  // Ao gravar com sucesso, o painel volta a pesquisa, pronto para o seguinte.
  const [estado, acao] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await addShoppingItem(prev, f);
    if (r.ok) {
      setEscolhido(null);
      setBusca('');
      setVersao((v) => v + 1);
    }
    return r;
  }, { ok: true } as ActionState);

  const resultados = useMemo(() => {
    const n = normalizar(busca.trim());
    if (!n) return [];
    return catalogo.filter((c) => normalizar(c.name).includes(n)).slice(0, MAX_RESULTADOS);
  }, [busca, catalogo]);

  function escolher(c: ItemCatalogo) {
    setEscolhido(c);
    setPreco(campo(c.emUso.price));
    setTamanho(campo(c.emUso.packQtyDisplay));
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Juntar insumo">
      {estado.message ? (
        <p
          role="status"
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            estado.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
          )}
        >
          {estado.message}
        </p>
      ) : null}

      {escolhido === null ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              key={versao}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar insumo (ex.: acucar, nata)"
              aria-label="Procurar insumo"
              className="pl-9"
              autoFocus
            />
          </div>
          {busca.trim() && resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum insumo com esse nome. Insumos novos criam-se em Cadastros → Insumos.
            </p>
          ) : null}
          <ul className="divide-y rounded-md border empty:hidden">
            {resultados.map((c) => {
              const e = lerEstoque(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => escolher(c)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {e.situacao !== 'ok' ? (
                      <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {e.situacao === 'sem-estoque' ? 'sem estoque' : 'abaixo do minimo'}
                      </Badge>
                    ) : null}
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatBaseQty(c.stockBase, c.baseUnit, currency)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <FichaDoInsumo
          key={escolhido.id}
          c={escolhido}
          listId={listId}
          lojas={lojas}
          currency={currency}
          preco={preco}
          setPreco={setPreco}
          tamanho={tamanho}
          setTamanho={setTamanho}
          acao={acao}
          voltar={() => setEscolhido(null)}
        />
      )}
    </section>
  );
}

function FichaDoInsumo({
  c,
  listId,
  lojas,
  currency,
  preco,
  setPreco,
  tamanho,
  setTamanho,
  acao,
  voltar,
}: {
  c: ItemCatalogo;
  listId: string;
  lojas: Loja[];
  currency: CurrencyConfig;
  preco: string;
  setPreco: (v: string) => void;
  tamanho: string;
  setTamanho: (v: string) => void;
  acao: (f: FormData) => void;
  voltar: () => void;
}) {
  const unidade = displayUnitOf(c.baseUnit);
  const rotulo = DISPLAY_UNIT_LABEL[c.baseUnit];
  const estoque = lerEstoque(c);

  let comp: Comparacao | null = null;
  try {
    comp = compararPreco(
      { price: parseDecimal(preco), packQty: parseDecimal(tamanho), packUnit: unidade },
      c.emUso.perBase,
    );
  } catch {
    comp = null;
  }
  const maisBarata = c.ofertas.find((o) => !o.inUse && o.perBase !== null);
  const maisBarataQueEmUso =
    maisBarata && c.emUso.perBase !== null && maisBarata.perBase! < c.emUso.perBase ? maisBarata : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.name}</p>
          <button type="button" onClick={voltar} className="text-xs text-primary hover:underline">
            ← escolher outro
          </button>
        </div>
      </div>

      {/* O que decide se vale a pena levar: estoque, minimo, para quanto chega. */}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-md bg-muted/40 p-2">
          <dt className="text-xs text-muted-foreground">Em estoque</dt>
          <dd
            className={cn(
              'font-medium tabular-nums',
              estoque.situacao !== 'ok' && 'text-amber-700 dark:text-amber-400',
            )}
          >
            {formatBaseQty(c.stockBase, c.baseUnit, currency)}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <dt className="text-xs text-muted-foreground">Minimo</dt>
          <dd className="font-medium tabular-nums">
            {c.minStockBase ? formatBaseQty(c.minStockBase, c.baseUnit, currency) : '—'}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <dt className="text-xs text-muted-foreground">Chega para</dt>
          <dd className="font-medium tabular-nums">
            {estoque.dias === null
              ? 'sem historico'
              : estoque.dias < 1
                ? 'menos de 1 dia'
                : `~${Math.round(estoque.dias)} dias`}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <dt className="text-xs text-muted-foreground">Preco em uso</dt>
          <dd className="font-medium tabular-nums">
            {c.emUso.perBase !== null ? formatCostPerUnit(c.emUso.perBase, c.baseUnit, currency) : '—'}
          </dd>
          <dd className="truncate text-xs text-muted-foreground">
            {c.emUso.supplierName ?? SEM_LOJA}
          </dd>
        </div>
      </dl>

      {maisBarataQueEmUso ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Tag className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Ja registado mais barato: {maisBarataQueEmUso.supplierName ?? SEM_LOJA} a{' '}
          {formatCostPerUnit(maisBarataQueEmUso.perBase!, c.baseUnit, currency)}.
        </p>
      ) : null}

      <form action={acao} className="space-y-3">
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="ingredientId" value={c.id} />
        <input type="hidden" name="packUnit" value={unidade} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Preco da embalagem" htmlFor="add-price">
            <Input
              id="add-price"
              name="price"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              required
            />
          </Field>
          <Field label="Embalagem" htmlFor="add-qty">
            <QtyInput
              id="add-qty"
              name="packQty"
              unitLabel={rotulo}
              value={tamanho}
              onChange={(e) => setTamanho(e.target.value)}
              required
            />
          </Field>
          <Field label="Quantas" htmlFor="add-packs">
            <Input id="add-packs" name="packs" inputMode="decimal" defaultValue="1" required />
          </Field>
          <Field label="Loja" htmlFor="add-loja">
            <CampoLoja lojas={lojas} inicial={c.emUso.supplierId} id="add-loja" />
          </Field>
        </div>

        {comp ? (
          <p
            className={cn(
              'rounded-md px-3 py-2 text-sm',
              comp.veredicto === 'mais-barato' && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
              comp.veredicto === 'mais-caro' && 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
              (comp.veredicto === 'igual' || comp.veredicto === 'sem-referencia') && 'bg-muted/50',
            )}
            aria-live="polite"
          >
            {formatCostPerUnit(comp.achado, c.baseUnit, currency)}
            {comp.veredicto === 'sem-referencia'
              ? ' — este insumo ainda nao tinha preco.'
              : comp.veredicto === 'igual'
                ? ' — o mesmo que o preco em uso.'
                : ` — ${Math.round(Math.abs(comp.diferenca!) * 100)}% ${
                    comp.veredicto === 'mais-barato' ? 'mais barato' : 'mais caro'
                  } que o preco em uso (${formatCostPerUnit(comp.referencia!, c.baseUnit, currency)}).`}
            {comp.veredicto === 'mais-barato' && estoque.dias !== null && estoque.dias > 30
              ? ' O estoque ainda chega para mais de um mes.'
              : ''}
          </p>
        ) : null}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="useAsCurrent" value="1" className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            Usar este preco daqui para a frente
            <span className="block text-xs text-muted-foreground">
              So ao fechar a compra. Sem isto, o preco fica registado para a loja mas nao
              muda o custo das fichas
              {c.emUso.supplierName
                ? ` — exceto se for em ${c.emUso.supplierName}, a loja do preco em uso: ai o preco dela e atualizado.`
                : '.'}
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <SubmitButton name="bought" value="0" variant="outline" pendingLabel="A juntar…">
            <Plus className="h-4 w-4" />
            Juntar a lista
          </SubmitButton>
          <SubmitButton name="bought" value="1" pendingLabel="A juntar…">
            <PackageCheck className="h-4 w-4" />
            Comprei — por no carrinho
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
