'use server';

/**
 * A aba de Compras: listas do comprador, independentes da producao.
 *
 * O ciclo de uma lista:
 *   1. junta-se o que comprar — a mao, o que esta abaixo do minimo, ou a
 *      lista de uma ordem de producao;
 *   2. no supermercado, o comprador risca, corrige preco, loja e embalagem,
 *      marca "nao havia", ou junta algo que achou mais barato;
 *   3. **fechar** da entrada no estoque do que foi riscado, ao preco pago, e
 *      regista esse preco para a loja.
 *
 * Riscar e desriscar nao mexe no estoque — so fechar. Assim, enquanto a lista
 * esta aberta, tudo se pode desfazer.
 *
 * O preco pago fica registado para aquela loja (Precos por fornecedor). So
 * passa a ser o preco **em uso** — o que alimenta o custo das fichas — se o
 * comprador o pedir, ou se ja era o dessa loja: a loja mudou o preco, e isso
 * e a realidade. Um preco mais barato noutra loja nao muda o custo dos
 * produtos sem ninguem decidir.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { gravarPlano, lerEstados, sincronizarEmUso } from '@/lib/escritas';
import { buildCostContext, num, numOrNull } from '@/lib/mappers';
import { parseDecimal, parseQty } from '@/lib/money';
import { embalagensParaMinimo, entradasDaCompra, precoPorBase } from '@/lib/pricing/compras';
import { buildPurchaseList } from '@/lib/pricing/purchase';
import { planMovements } from '@/lib/pricing/stock';
import { baseUnitOf, type PurchaseUnit } from '@/lib/units';
import { errorMessage, PURCHASE_UNIT, type ActionState } from './shared';

const STATUS = ['PENDING', 'BOUGHT', 'MISSING'] as const;
type Status = (typeof STATUS)[number];

/**
 * Riscar e corrigir so mexem nesta lista: invalidar a app inteira a cada
 * toque tornava cada toque lento. Fechar mexe no estoque e nos precos, que
 * aparecem em quase todo o lado — ai sim, tudo.
 */
function revalidar(listId?: string, tudo = false) {
  revalidatePath('/compras');
  if (listId) revalidatePath(`/compras/${listId}`);
  if (tudo) revalidatePath('/', 'layout');
}

function presente(form: FormData, nome: string): boolean {
  return form.get(nome) !== null;
}

async function listaAberta(listId: string) {
  if (!listId) throw new Error('Lista nao informada.');
  const lista = await prisma.shoppingList.findUnique({ where: { id: listId } });
  if (!lista) throw new Error('Lista nao encontrada.');
  if (lista.closedAt) {
    throw new Error('Esta lista ja foi fechada. Para corrigir o estoque, use um ajuste no Estoque.');
  }
  return lista;
}

/**
 * A loja escolhida no formulario: `supplierId` vazio e "sem loja"; "novo"
 * cria (ou reaproveita, se o nome ja existir) a loja escrita em
 * `newSupplierName`. Devolve `undefined` quando o campo nao veio.
 */
async function lerLoja(form: FormData): Promise<string | null | undefined> {
  if (!presente(form, 'supplierId')) return undefined;
  const valor = String(form.get('supplierId'));
  if (valor === '') return null;
  if (valor !== 'novo') return valor;
  const nome = String(form.get('newSupplierName') ?? '').trim();
  if (!nome) throw new Error('Escreva o nome da loja nova.');
  // O nome e unico; sem distinguir maiusculas, "continente" e "Continente"
  // seriam duas lojas.
  const existente = await prisma.supplier.findFirst({
    where: { name: { equals: nome, mode: 'insensitive' } },
  });
  if (existente) return existente.id;
  return (await prisma.supplier.create({ data: { name: nome } })).id;
}

/**
 * A linha deste insumo que ainda esta por resolver (por comprar ou "nao
 * havia"). E nela que se soma ou se corrige, para nao haver duas.
 */
function linhaAberta(listId: string, ingredientId: string) {
  return prisma.shoppingItem.findFirst({
    where: { listId, ingredientId, status: { in: ['PENDING', 'MISSING'] } },
    orderBy: { sortOrder: 'asc' },
  });
}

function lerEmbalagens(valor: FormDataEntryValue | null): number {
  const n = parseQty(String(valor ?? ''));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Quantas embalagens? Tem de ser mais que zero.');
  return n;
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export async function createShoppingList(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('De um nome a lista (ex.: "Semana 40", "Makro sabado").');
    id = (await prisma.shoppingList.create({ data: { name } })).id;
    revalidar();
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect(`/compras/${id}`);
}

export async function renameShoppingList(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('id') ?? ''));
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new Error('O nome nao pode ficar vazio.');
    await prisma.shoppingList.update({ where: { id: lista.id }, data: { name } });
    revalidar(lista.id);
    return { ok: true, message: 'Nome alterado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** So listas abertas: uma fechada ja deu entrada no estoque e e historico. */
export async function deleteShoppingList(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('id') ?? ''));
    await prisma.shoppingList.delete({ where: { id: lista.id } });
    revalidar();
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/compras');
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

/**
 * Junta um insumo a lista.
 *
 * Sem preco no formulario, usa o preco em uso (loja, preco e embalagem). Com
 * preco — o "achei mais barato" — usa o que o comprador escreveu. Com
 * `bought=1`, entra ja riscado: e o que se comprou por oportunidade.
 *
 * **Uma linha por insumo.** Se o insumo ja esta por comprar (ou "nao havia")
 * nesta lista:
 *  - sem preco, somam-se as embalagens a essa linha;
 *  - com preco (achei mais barato), essa linha passa a ter o preco, a loja, a
 *    embalagem e a quantidade escritos — o comprador mudou onde compra, nao
 *    quer duas linhas do mesmo;
 *  - com `bought=1`, essa linha fica riscada.
 * A excecao e o que ja esta no carrinho: precisar de mais entra numa linha
 * nova, por comprar. Somar a linha riscada misturava o que ja foi apanhado
 * com o que ainda falta.
 */
export async function addShoppingItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('listId') ?? ''));
    const ingredientId = String(form.get('ingredientId') ?? '');
    if (!ingredientId) throw new Error('Escolha um insumo.');
    const insumo = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!insumo) throw new Error('Insumo nao encontrado.');

    const packs = lerEmbalagens(form.get('packs') ?? '1');
    const comprado = form.get('bought') === '1';
    const refPricePerBase = precoPorBase({
      price: num(insumo.purchasePrice),
      packQty: num(insumo.purchaseQty),
      packUnit: insumo.purchaseUnit,
    });

    const comPreco = String(form.get('price') ?? '').trim() !== '';
    let supplierId: string | null;
    let price: number;
    let packQty: number;
    let packUnit: PurchaseUnit;
    if (comPreco) {
      price = parseDecimal(String(form.get('price')));
      packQty = parseQty(String(form.get('packQty') ?? ''));
      packUnit = PURCHASE_UNIT.parse(String(form.get('packUnit') ?? insumo.purchaseUnit));
      if (!(price >= 0)) throw new Error('Preco invalido.');
      if (!(packQty > 0)) throw new Error('A embalagem tem de ter tamanho.');
      if (baseUnitOf(packUnit) !== insumo.baseUnit) {
        throw new Error(`"${insumo.name}" nao se mede nessa unidade. Escolha uma da mesma familia.`);
      }
      const loja = await lerLoja(form);
      supplierId = loja === undefined ? insumo.supplierId : loja;
    } else {
      supplierId = insumo.supplierId;
      price = num(insumo.purchasePrice);
      packQty = num(insumo.purchaseQty);
      packUnit = insumo.purchaseUnit;
    }

    const igual = await linhaAberta(lista.id, ingredientId);
    const status = comprado ? ('BOUGHT' as const) : ('PENDING' as const);

    if (igual && comPreco) {
      await prisma.shoppingItem.update({
        where: { id: igual.id },
        data: {
          packs,
          supplierId,
          price,
          packQty,
          packUnit,
          status,
          useAsCurrent: form.get('useAsCurrent') === '1',
        },
      });
    } else if (igual) {
      await prisma.shoppingItem.update({
        where: { id: igual.id },
        data: { packs: num(igual.packs) + packs, status },
      });
    } else {
      const ultimo = await prisma.shoppingItem.findFirst({
        where: { listId: lista.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await prisma.shoppingItem.create({
        data: {
          listId: lista.id,
          ingredientId,
          packs,
          supplierId,
          price,
          packQty,
          packUnit,
          refPricePerBase,
          status: comprado ? 'BOUGHT' : 'PENDING',
          useAsCurrent: form.get('useAsCurrent') === '1',
          sortOrder: (ultimo?.sortOrder ?? -1) + 1,
        },
      });
    }

    revalidar(lista.id);
    return {
      ok: true,
      message: igual && comPreco
        ? `"${insumo.name}" ja estava na lista: atualizei o preco e a loja${comprado ? ' e pus no carrinho' : ''}.`
        : igual
          ? `"${insumo.name}" ja estava na lista: somei ${packs} embalagem(ns).`
          : comprado
          ? `"${insumo.name}" entrou na lista, ja no carrinho.`
          : `"${insumo.name}" entrou na lista.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Junta tudo o que esta no minimo ou abaixo e ainda nao esta na lista. */
export async function addBelowMinimum(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('listId') ?? ''));
    const [insumos, jaNaLista] = await Promise.all([
      prisma.ingredient.findMany({ where: { minStockBase: { gt: 0 } }, orderBy: { name: 'asc' } }),
      prisma.shoppingItem.findMany({ where: { listId: lista.id }, select: { ingredientId: true } }),
    ]);
    const ja = new Set(jaNaLista.map((i) => i.ingredientId));

    const novos = insumos
      .filter((i) => !ja.has(i.id) && num(i.stockBase) <= num(i.minStockBase))
      .map((i) => {
        const embalagem = { packQty: num(i.purchaseQty), packUnit: i.purchaseUnit };
        // No minimo certinho ainda nao falta nada, mas quem pediu "o que esta
        // no minimo" quer pelo menos uma embalagem.
        const packs = Math.max(1, embalagensParaMinimo(num(i.stockBase), numOrNull(i.minStockBase), embalagem));
        return { i, packs };
      });

    if (novos.length === 0) {
      return {
        ok: true,
        message: ja.size > 0
          ? 'Nada a juntar: o que esta abaixo do minimo ja esta na lista.'
          : 'Nada abaixo do minimo. (Os minimos definem-se em Insumos.)',
      };
    }

    const ultimo = await prisma.shoppingItem.findFirst({
      where: { listId: lista.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    let ordem = (ultimo?.sortOrder ?? -1) + 1;
    await prisma.shoppingItem.createMany({
      data: novos.map(({ i, packs }) => ({
        listId: lista.id,
        ingredientId: i.id,
        packs,
        supplierId: i.supplierId,
        price: num(i.purchasePrice),
        packQty: num(i.purchaseQty),
        packUnit: i.purchaseUnit,
        refPricePerBase: precoPorBase({
          price: num(i.purchasePrice),
          packQty: num(i.purchaseQty),
          packUnit: i.purchaseUnit,
        }),
        sortOrder: ordem++,
      })),
    });

    revalidar(lista.id);
    return { ok: true, message: `${novos.length} insumo(s) abaixo do minimo entraram na lista.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Copia para aqui o que uma ordem de producao manda comprar — somando ao que
 * ja esta por comprar, e uma vez so por ordem. A ordem nao muda:
 * continua a ter a sua lista e o seu "Recebi esta compra" — use um ou outro
 * para dar entrada, nao os dois.
 */
export async function addFromOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('listId') ?? ''));
    const orderId = String(form.get('orderId') ?? '');
    if (!orderId) throw new Error('Escolha uma ordem de producao.');

    const [ordem, ingredientes, fichas] = await Promise.all([
      prisma.productionOrder.findUnique({ where: { id: orderId }, include: { lines: true } }),
      prisma.ingredient.findMany({ include: { supplier: true } }),
      prisma.recipe.findMany({ include: { items: true } }),
    ]);
    if (!ordem) throw new Error('Ordem nao encontrada.');
    if (ordem.lines.length === 0) throw new Error('Essa ordem nao tem produtos.');

    const compra = buildPurchaseList(
      ordem.lines.map((l) => ({ recipeId: l.recipeId, qty: num(l.qty) })),
      buildCostContext(ingredientes, fichas),
    );
    const linhas = compra.lines.filter((l) => l.packsToBuy > 0);
    if (linhas.length === 0) {
      return { ok: true, message: 'O estoque ja cobre essa ordem: nada a comprar.' };
    }

    const nota = `Para "${ordem.name}"`;
    let somados = 0;
    await prisma.$transaction(
      async (tx) => {
        // Guarda atomica: so passa quem marcar a ordem como juntada. Dois
        // toques seguidos no botao (ou dois telemoveis) entram uma vez.
        const marcada = await tx.shoppingList.updateMany({
          where: { id: lista.id, NOT: { orderIds: { has: orderId } } },
          data: { orderIds: { push: orderId } },
        });
        if (marcada.count !== 1) {
          throw new Error(`"${ordem.name}" ja foi juntada a esta lista.`);
        }

        const abertas = await tx.shoppingItem.findMany({
          where: { listId: lista.id, status: { in: ['PENDING', 'MISSING'] } },
          orderBy: { sortOrder: 'asc' },
        });
        const porInsumo = new Map<string, (typeof abertas)[number]>();
        for (const a of abertas) if (!porInsumo.has(a.ingredientId)) porInsumo.set(a.ingredientId, a);

        const ultimo = await tx.shoppingItem.findFirst({
          where: { listId: lista.id },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        let ordemItem = (ultimo?.sortOrder ?? -1) + 1;

        for (const l of linhas) {
          const ja = porInsumo.get(l.ingredient.id);
          if (ja) {
            // Uma linha por insumo: soma, e a nota passa a dizer as duas origens.
            await tx.shoppingItem.update({
              where: { id: ja.id },
              data: {
                packs: num(ja.packs) + l.packsToBuy,
                status: 'PENDING',
                note: ja.note ? (ja.note.includes(nota) ? ja.note : `${ja.note} · ${nota}`) : nota,
              },
            });
            somados++;
          } else {
            await tx.shoppingItem.create({
              data: {
                listId: lista.id,
                ingredientId: l.ingredient.id,
                packs: l.packsToBuy,
                supplierId: l.ingredient.supplierId ?? null,
                price: l.ingredient.purchasePrice,
                packQty: l.ingredient.purchaseQty,
                packUnit: l.ingredient.purchaseUnit,
                refPricePerBase: precoPorBase({
                  price: l.ingredient.purchasePrice,
                  packQty: l.ingredient.purchaseQty,
                  packUnit: l.ingredient.purchaseUnit,
                }),
                note: nota,
                sortOrder: ordemItem++,
              },
            });
          }
        }
      },
      { timeout: 20000, maxWait: 10000 },
    );

    revalidar(lista.id);
    const novos = linhas.length - somados;
    return {
      ok: true,
      message: `"${ordem.name}": ${novos} insumo(s) novo(s)${somados ? `, ${somados} somado(s) ao que ja estava na lista` : ''}.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Corrige um item: embalagens, preco, loja, tamanho da embalagem, nota e
 * "usar este preco daqui para a frente". So muda o que veio no formulario.
 */
export async function updateShoppingItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const item = await prisma.shoppingItem.findUnique({
      where: { id },
      include: { ingredient: { select: { name: true, baseUnit: true } } },
    });
    if (!item) throw new Error('Item nao encontrado.');
    await listaAberta(item.listId);

    const data: Record<string, unknown> = {};
    if (presente(form, 'packs')) data.packs = lerEmbalagens(form.get('packs'));
    if (presente(form, 'price')) {
      const price = parseDecimal(String(form.get('price')));
      if (!(price >= 0)) throw new Error('Preco invalido.');
      data.price = price;
    }
    if (presente(form, 'packQty')) {
      const packQty = parseQty(String(form.get('packQty')));
      if (!(packQty > 0)) throw new Error('A embalagem tem de ter tamanho.');
      data.packQty = packQty;
    }
    if (presente(form, 'packUnit')) {
      const packUnit = PURCHASE_UNIT.parse(String(form.get('packUnit')));
      if (baseUnitOf(packUnit) !== item.ingredient.baseUnit) {
        throw new Error(`"${item.ingredient.name}" nao se mede nessa unidade.`);
      }
      data.packUnit = packUnit;
    }
    const loja = await lerLoja(form);
    if (loja !== undefined) data.supplierId = loja;
    // Um checkbox so vem quando esta marcado; o formulario manda o campo
    // escondido `useAsCurrentSent` para se saber que a pergunta foi feita.
    if (presente(form, 'useAsCurrentSent')) data.useAsCurrent = form.get('useAsCurrent') === '1';
    if (presente(form, 'note')) data.note = String(form.get('note')).trim() || null;
    if (Object.keys(data).length === 0) return { ok: true };

    await prisma.shoppingItem.update({ where: { id }, data });
    revalidar(item.listId);
    return { ok: true, message: 'Item atualizado.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Riscar (BOUGHT), desriscar (PENDING) ou "nao havia" (MISSING). */
export async function setShoppingItemStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const status = String(form.get('status') ?? '') as Status;
    if (!STATUS.includes(status)) throw new Error('Estado invalido.');
    const item = await prisma.shoppingItem.findUnique({ where: { id } });
    if (!item) throw new Error('Item nao encontrado.');
    await listaAberta(item.listId);
    await prisma.shoppingItem.update({ where: { id }, data: { status } });
    revalidar(item.listId);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function removeShoppingItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get('id') ?? '');
    const item = await prisma.shoppingItem.findUnique({ where: { id } });
    if (!item) throw new Error('Item nao encontrado.');
    await listaAberta(item.listId);
    await prisma.shoppingItem.delete({ where: { id } });
    revalidar(item.listId);
    return { ok: true, message: 'Item removido.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Fechar
// ---------------------------------------------------------------------------

/**
 * Da entrada no estoque do que foi riscado, ao preco pago, e regista os
 * precos. O que ficou por comprar ou "nao havia" fica na lista como registo,
 * sem mexer em nada.
 *
 * O estoque vai primeiro, numa transacao com a guarda atomica de "ainda
 * aberta" (dois telemoveis a fechar ao mesmo tempo entram uma vez so). Os
 * precos vem a seguir, noutra: se falharem, o estoque ja esta certo e a
 * mensagem diz o que faltou.
 */
export async function closeShoppingList(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const lista = await listaAberta(String(form.get('id') ?? ''));
    const comprados = await prisma.shoppingItem.findMany({
      where: { listId: lista.id, status: 'BOUGHT' },
      include: { ingredient: { select: { name: true, baseUnit: true } } },
    });
    if (comprados.length === 0) {
      throw new Error('Nada riscado: risque o que comprou antes de fechar.');
    }

    const entradas = entradasDaCompra(
      comprados.map((i) => ({
        ingredientId: i.ingredientId,
        ingredientName: i.ingredient.name,
        baseUnit: i.ingredient.baseUnit,
        packs: num(i.packs),
        price: num(i.price),
        packQty: num(i.packQty),
        packUnit: i.packUnit,
      })),
      lista.name,
    );
    const plano = planMovements(
      await lerEstados(),
      entradas.map((e) => ({ ...e, kind: 'PURCHASE' as const })),
    );

    await gravarPlano(plano, null, async () => {
      const r = await prisma.shoppingList.updateMany({
        where: { id: lista.id, closedAt: null },
        data: { closedAt: new Date() },
      });
      return r.count === 1;
    });

    let precos = 0;
    let emUso = 0;
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const i of comprados) {
            const dados = {
              purchasePrice: num(i.price),
              purchaseQty: num(i.packQty),
              purchaseUnit: i.packUnit,
            };
            // Uma so oferta por loja por insumo (e uma so "sem loja"); o
            // Postgres nao apanha o caso do NULL na restricao unica.
            const existente = await tx.supplierOffer.findFirst({
              where: { ingredientId: i.ingredientId, supplierId: i.supplierId },
            });
            const oferta = existente
              ? await tx.supplierOffer.update({ where: { id: existente.id }, data: { ...dados, active: true } })
              : await tx.supplierOffer.create({
                  data: { ingredientId: i.ingredientId, supplierId: i.supplierId, ...dados },
                });
            precos++;

            const atual = await tx.supplierOffer.findFirst({
              where: { ingredientId: i.ingredientId, inUse: true },
            });
            // Passa a valer se: foi pedido; era ja o preco em uso (a loja
            // mudou o preco); ou o insumo nao tinha nenhum em uso.
            if (i.useAsCurrent || !atual || atual.id === oferta.id) {
              await sincronizarEmUso(tx, i.ingredientId, oferta.id);
              if (i.useAsCurrent || !atual) emUso++;
            }
          }
        },
        { timeout: 20000, maxWait: 10000 },
      );
    } catch (err) {
      revalidar(lista.id, true);
      return {
        ok: false,
        message: `O estoque entrou (${plano.length} movimento(s)), mas os precos nao ficaram registados: ${errorMessage(err)}`,
      };
    }

    revalidar(lista.id, true);
    const extra = emUso > 0 ? ` ${emUso} passou(aram) a ser o preco em uso.` : '';
    return {
      ok: true,
      message: `Compra fechada: ${plano.length} item(ns) deram entrada no estoque e ${precos} preco(s) ficaram registados.${extra}`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
