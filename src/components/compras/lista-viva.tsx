'use client';

/**
 * A lista de compras do comprador, dentro do supermercado.
 *
 * Como a checklist da producao, e para usar de pe, com uma mao: uma lista
 * so, sem grupos por loja, uma linha por item (ver `LinhaCompra`). O circulo
 * risca; a linha abre loja, preco e botoes. O riscado desce para "No
 * carrinho", fechado, e o topo diz sempre quanto falta. A diferenca e que aqui cada toque vai ao servidor —
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
  ClipboardList,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog, SubmitButton } from '@/components/action-form';
import { LinhaCompra, SecaoFechada } from '@/components/compras/linha-compra';
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

/** Os botoes do detalhe de um item: compactos, para caberem os tres numa fila. */
const BOTAO_DETALHE = 'h-8 gap-1 px-2 text-xs text-muted-foreground';

/** Por comprar, por pagina. */
const POR_PAGINA = 20;
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
  // Lista vazia: as ferramentas de juntar ja abertas, que e o que ha a fazer.
  const [juntar, setJuntar] = useState(itens.length === 0 && aberta);
  const [painel, setPainel] = useState(itens.length === 0 && aberta);
  // Um detalhe aberto de cada vez: a lista nao cresce sem se dar por isso.
  const [aberto, setAberto] = useState<string | null>(null);
  const [pedida, setPedida] = useState(1);

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

  // O que falta fica no topo; o que esta no carrinho e o que nao havia descem
  // para secoes fechadas. Nao se rola por cima do que ja esta resolvido.
  const porComprar = otimista.filter((i) => i.status === 'PENDING');
  const comprados = otimista.filter((i) => i.status === 'BOUGHT');
  const naoHavia = otimista.filter((i) => i.status === 'MISSING');
  const contam = porComprar.length + comprados.length;
  const previsto = [...porComprar, ...comprados].reduce((a, i) => a + i.packs * i.price, 0);
  const noCarrinho = comprados.reduce((a, i) => a + i.packs * i.price, 0);

  const p = pagina(porComprar.length, POR_PAGINA, pedida);

  // A linha por resolver de cada insumo: o painel avisa que juntar vai somar
  // ou corrigir essa linha, em vez de criar outra (ver addShoppingItem).
  const naLista = new Map<string, ItemLista>();
  for (const i of [...porComprar, ...naoHavia]) if (!naLista.has(i.ingredientId)) naLista.set(i.ingredientId, i);

  const linha = (i: ItemLista) => (
    <LinhaItem
      key={i.id}
      item={i}
      aberta={aberta}
      lojas={lojas}
      currency={currency}
      onEstado={mudarEstado}
      aberto={aberto === i.id}
      onAbrir={() => setAberto((a) => (a === i.id ? null : i.id))}
    />
  );

  return (
    <div className="space-y-3">
      {/* Uma linha de progresso, colada ao topo: e o que se consulta a meio. */}
      <div className="sticky top-14 z-10 rounded-lg border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            <strong className="tabular-nums">
              {comprados.length} de {contam}
            </strong>{' '}
            <span className="text-muted-foreground">
              · <span className="tabular-nums">{formatMoney(noCarrinho, currency)}</span> de{' '}
              <span className="tabular-nums">{formatMoney(previsto, currency)}</span>
            </span>
          </p>
          {aberta ? (
            <FecharCompra
              listId={listId}
              comprados={comprados.length}
              total={formatMoney(noCarrinho, currency)}
              porComprar={porComprar.length}
              naoHavia={naoHavia.length}
            />
          ) : null}
        </div>
        <div
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={comprados.length}
          aria-valuemin={0}
          aria-valuemax={contam}
          aria-label="Itens no carrinho"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${contam ? (comprados.length / contam) * 100 : 0}%` }}
          />
        </div>
      </div>

      {erro ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {erro}
        </p>
      ) : null}

      {aberta ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant={juntar ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setJuntar((v) => !v)}
            aria-expanded={juntar}
          >
            {juntar ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Juntar
          </Button>
          {juntar ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={painel ? 'secondary' : 'default'}
                onClick={() => setPainel((v) => !v)}
                aria-expanded={painel}
              >
                <Search className="h-4 w-4" />
                Procurar insumo / achei mais barato
              </Button>
              <ActionForm action={addBelowMinimum} className="space-y-2">
                <input type="hidden" name="listId" value={listId} />
                <SubmitButton size="sm" variant="outline" pendingLabel="A juntar…">
                  <BellRing className="h-4 w-4" />
                  Abaixo do minimo
                </SubmitButton>
              </ActionForm>
              {ordens.length > 0 ? <DeUmaProducao listId={listId} ordens={ordens} /> : null}
            </div>
          ) : null}
          {juntar && painel ? (
            <PainelAdicionar
              listId={listId}
              catalogo={catalogo}
              lojas={lojas}
              currency={currency}
              naLista={naLista}
            />
          ) : null}
        </div>
      ) : null}

      {otimista.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Lista vazia. Junte insumos com o botao acima.
        </p>
      ) : (
        <>
          {porComprar.length > 0 ? (
            <section className="rounded-lg border bg-card" aria-label="Por comprar">
              <ul className="divide-y">{porComprar.slice(p.inicio, p.fim).map(linha)}</ul>
              <Paginacao p={p} onChange={setPedida} className="border-t px-4 py-2" />
            </section>
          ) : aberta ? (
            <p className="rounded-lg border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
              Tudo no carrinho. Falta so <strong>Fechar compra</strong>.
            </p>
          ) : null}
          <SecaoFechada titulo={aberta ? 'No carrinho' : 'Comprado'} n={comprados.length}>
            {comprados.map(linha)}
          </SecaoFechada>
          <SecaoFechada titulo="Nao havia" n={naoHavia.length}>
            {naoHavia.map(linha)}
          </SecaoFechada>
        </>
      )}

      {aberta ? (
        <p className="text-xs text-muted-foreground">
          Toque no circulo para riscar e na linha para ver loja e preco. Riscar nao mexe
          no estoque: so <strong>Fechar compra</strong> da entrada, ao preco pago. Lista:{' '}
          {listName}.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Um item
// ---------------------------------------------------------------------------

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
  aberto,
  onAbrir,
}: {
  item: ItemLista;
  aberta: boolean;
  lojas: Loja[];
  currency: CurrencyConfig;
  onEstado: (id: string, status: Estado) => void;
  aberto: boolean;
  onAbrir: () => void;
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

  return (
    <LinhaCompra
      nome={item.name}
      quantidade={`${campo(item.packs)}× ${embalagem}`}
      preco={formatMoney(item.packs * item.price, currency)}
      feito={feito}
      apagado={faltou}
      aberto={aberto}
      // Riscar um "nao havia" mete-o no carrinho: afinal havia.
      onRiscar={aberta ? () => onEstado(item.id, feito ? 'PENDING' : 'BOUGHT') : undefined}
      onAbrir={onAbrir}
    >
      {/* Texto corrido, nao flex: com nomes de loja compridos, o flex partia
          a linha em duas colunas. */}
      <p>
        <Store className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" aria-hidden />
        <span className="font-medium">{item.supplierName ?? SEM_LOJA}</span>{' '}
        <span className="text-muted-foreground">· {formatMoney(item.price, currency)} a embalagem</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {perBase !== null ? <span>{formatCostPerUnit(perBase, item.baseUnit, currency)}</span> : null}
        <TextoDiferenca c={comp} />
        <span>· em casa {formatBaseQty(item.stockBase, item.baseUnit, currency)}</span>
        {item.useAsCurrent ? <Badge variant="secondary">vai passar a preco em uso</Badge> : null}
      </div>
      {item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
      {aberta ? (
        // Lado a lado, sempre, e sem quebrar: compactos para os tres caberem
        // numa fila mesmo num telemovel de 360 px.
        <div className="-ml-2 flex flex-nowrap items-center gap-0.5 pt-1">
          <EditarItem item={item} lojas={lojas} />
          {!feito ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEstado(item.id, faltou ? 'PENDING' : 'MISSING')}
              className={BOTAO_DETALHE}
            >
              <AlertTriangle className="h-4 w-4" />
              {faltou ? 'Afinal havia' : 'Nao havia'}
            </Button>
          ) : null}
          <ConfirmDelete
            action={removeShoppingItem}
            fields={{ id: item.id }}
            title={`Tirar "${item.name}" da lista?`}
            confirmLabel="Tirar"
            trigger={
              <Button variant="ghost" size="sm" className={cn(BOTAO_DETALHE, 'hover:text-destructive')}>
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            }
          />
        </div>
      ) : null}
    </LinhaCompra>
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
    <FormDialog
      action={updateShoppingItem}
      title={item.name}
      description="Corrija o que for diferente no supermercado. O preco novo fica registado para a loja ao fechar a compra."
      trigger={
        <Button type="button" variant="ghost" size="sm" className={BOTAO_DETALHE}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      }
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
  naLista,
  catalogo,
  lojas,
  currency,
}: {
  listId: string;
  catalogo: ItemCatalogo[];
  lojas: Loja[];
  currency: CurrencyConfig;
  naLista: Map<string, ItemLista>;
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
                    {naLista.has(c.id) ? <Badge variant="secondary">na lista</Badge> : null}
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
          jaNaLista={naLista.get(escolhido.id)}
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
  jaNaLista,
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
  /** A linha deste insumo ainda por comprar nesta lista, se houver. */
  jaNaLista?: ItemLista;
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

      {jaNaLista ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Ja esta na lista ({campo(jaNaLista.packs)}× a {formatMoney(jaNaLista.price, currency)},{' '}
          {jaNaLista.supplierName ?? SEM_LOJA}). <strong>Juntar</strong> corrige essa linha com o
          preco, a loja e a quantidade daqui — nao cria outra.
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
            <Input
              id="add-packs"
              name="packs"
              inputMode="decimal"
              defaultValue={jaNaLista ? campo(jaNaLista.packs) : '1'}
              required
            />
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
