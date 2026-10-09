/**
 * O preco das linhas de uma encomenda: cardapio, promocao, combo e cupao.
 *
 * Fora de um ficheiro 'use server' de proposito: exporta funcoes sincronas e
 * tipos, que as actions das encomendas usam.
 *
 * Regras:
 * - Preco escrito a mao vale como esta (preco combinado): sem promocao.
 * - Sem preco escrito: o preco do cardapio, com a promocao do dia da
 *   entrega que fique mais barata; se a ficha nao estiver no cardapio, o
 *   preco de tabela, como sempre foi.
 * - Um combo desdobra-se nas linhas das fichas que leva, com o preco
 *   repartido (`repartirCombo`), para a producao e as vendas por produto
 *   continuarem certas.
 * - O cupao aplica-se no fim, por cima de tudo, e fica no `unitPrice` de
 *   cada linha (o que o cliente paga) e em `couponDiscount`.
 */

import { prisma } from '@/lib/db';
import { num } from '@/lib/mappers';
import type { CurrencyConfig } from '@/lib/money';
import {
  aplicarCupao,
  centimos,
  normalizarCodigo,
  precoDaLinha,
  repartirCombo,
  type CupaoInput,
  type PromocaoInput,
} from '@/lib/pricing/cardapio';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes } from '@/lib/queries';
import { diaDaColuna, promocaoInput } from './consultas';

/** O prefixo do valor de um combo na lista de produtos da encomenda. */
export const PREFIXO_COMBO = 'combo:';

/**
 * Preco de tabela e custos de hoje, por ficha. Uma leitura so para todas as
 * linhas: o custo de um produto pode descer por varias sub-receitas.
 */
export async function tabelaDeHoje() {
  const { recipes, settings, channels } = await getCostedRecipes();
  const ref = referenceChannel(channels);
  return new Map(
    recipes.map((r) => {
      const preco = priceForRecipe(r, ref, settings);
      return [
        r.id,
        {
          name: r.name,
          kind: r.kind,
          error: r.error,
          listPrice: preco?.feasible && preco.price > 0 ? preco.price : null,
          food: r.cost?.foodCostPerUnit ?? 0,
          packaging: r.cost?.packagingCost ?? 0,
          deliveryPackaging: r.cost?.deliveryPackagingCost ?? 0,
        },
      ];
    }),
  );
}

export type Tabela = Awaited<ReturnType<typeof tabelaDeHoje>>;

export interface DadosDePreco {
  tabela: Tabela;
  /** O item do cardapio de cada ficha (produto). */
  doCardapio: Map<string, { menuItemId: string; price: number }>;
  combos: Map<string, { name: string; price: number; components: Array<{ recipeId: string; qty: number }> }>;
  promocoes: PromocaoInput[];
}

export async function dadosDePreco(): Promise<DadosDePreco> {
  const [tabela, itens, promos] = await Promise.all([
    tabelaDeHoje(),
    prisma.menuItem.findMany({ include: { components: true } }),
    prisma.promotion.findMany({ where: { active: true }, include: { items: { select: { menuItemId: true } } } }),
  ]);
  const doCardapio = new Map<string, { menuItemId: string; price: number }>();
  const combos: DadosDePreco['combos'] = new Map();
  for (const i of itens) {
    if (i.kind === 'PRODUCT' && i.recipeId) {
      doCardapio.set(i.recipeId, { menuItemId: i.id, price: num(i.price) });
    } else if (i.kind === 'COMBO') {
      combos.set(i.id, {
        name: i.name ?? 'Combo',
        price: num(i.price),
        components: i.components.map((c) => ({ recipeId: c.recipeId, qty: num(c.qty) })),
      });
    }
  }
  return { tabela, doCardapio, combos, promocoes: promos.map((p) => promocaoInput(p)) };
}

export interface LinhaCalculada {
  recipeId: string;
  qty: number;
  unitPrice: number;
  listPrice: number | null;
  unitFoodCost: number;
  unitPackagingCost: number;
  unitDeliveryPackagingCost: number;
  promotionId: string | null;
  menuItemId: string | null;
  couponDiscount: number | null;
  /** Ao centimo, o que a linha vale antes do cupao. Nao vai para a base. */
  total: number;
}

function custosDe(tabela: Tabela, recipeId: string) {
  const t = tabela.get(recipeId);
  if (!t || t.kind !== 'PRODUCT') throw new Error('Produto nao encontrado.');
  if (t.error) throw new Error(`"${t.name}": ${t.error}`);
  return t;
}

/**
 * As linhas de uma entrada do formulario: uma para um produto, varias para
 * um combo. `dia` e o dia da entrega em Lisboa ("AAAA-MM-DD").
 */
export function linhasDaEntrada(
  d: DadosDePreco,
  entrada: { recipeId: string; qty: number; price: number | null },
  dia: string,
): LinhaCalculada[] {
  const { qty, price } = entrada;

  if (entrada.recipeId.startsWith(PREFIXO_COMBO)) {
    const menuItemId = entrada.recipeId.slice(PREFIXO_COMBO.length);
    const combo = d.combos.get(menuItemId);
    if (!combo) throw new Error('Combo nao encontrado.');
    if (!(qty > 0) || !Number.isInteger(qty)) throw new Error(`A quantidade de "${combo.name}" tem de ser um numero inteiro.`);
    if (price != null && price < 0) throw new Error(`O preco de "${combo.name}" nao pode ser negativo.`);

    const p = price != null ? null : precoDaLinha(menuItemId, combo.price, qty, d.promocoes, dia);
    const total = price != null ? centimos(price * qty) : p!.total;
    const partes = repartirCombo(
      total / qty,
      qty,
      combo.components.map((c) => ({
        recipeId: c.recipeId,
        qty: c.qty,
        refPrice: d.doCardapio.get(c.recipeId)?.price ?? d.tabela.get(c.recipeId)?.listPrice ?? 0,
      })),
    );
    // O preco "de lista" de cada linha e a parte dela no combo sem promocao,
    // para a encomenda mostrar o desconto da promocao ou do preco combinado.
    const semDesconto = repartirCombo(
      combo.price,
      qty,
      combo.components.map((c) => ({
        recipeId: c.recipeId,
        qty: c.qty,
        refPrice: d.doCardapio.get(c.recipeId)?.price ?? d.tabela.get(c.recipeId)?.listPrice ?? 0,
      })),
    );
    return partes.map((parte, i) => {
      const t = custosDe(d.tabela, parte.recipeId);
      return {
        recipeId: parte.recipeId,
        qty: parte.qty,
        unitPrice: parte.unitPrice,
        listPrice: semDesconto[i].unitPrice,
        unitFoodCost: t.food,
        unitPackagingCost: t.packaging,
        unitDeliveryPackagingCost: t.deliveryPackaging,
        promotionId: p?.promotionId ?? null,
        menuItemId,
        couponDiscount: null,
        total: parte.total,
      };
    });
  }

  const t = custosDe(d.tabela, entrada.recipeId);
  if (!(qty > 0)) throw new Error(`A quantidade de "${t.name}" tem de ser maior que zero.`);
  const menu = d.doCardapio.get(entrada.recipeId);
  const lista = menu?.price ?? t.listPrice;

  let unitPrice: number;
  let total: number;
  let promotionId: string | null = null;
  if (price != null) {
    if (price < 0) throw new Error(`O preco de "${t.name}" nao pode ser negativo.`);
    unitPrice = price;
    total = centimos(price * qty);
  } else {
    if (lista == null) throw new Error(`"${t.name}" nao tem preco de tabela. Escreva o preco combinado.`);
    const p = precoDaLinha(menu?.menuItemId ?? null, lista, qty, d.promocoes, dia);
    unitPrice = p.unitPrice;
    total = p.total;
    promotionId = p.promotionId;
  }
  return [
    {
      recipeId: entrada.recipeId,
      qty,
      unitPrice,
      listPrice: lista,
      unitFoodCost: t.food,
      unitPackagingCost: t.packaging,
      unitDeliveryPackagingCost: t.deliveryPackaging,
      promotionId,
      menuItemId: menu?.menuItemId ?? null,
      couponDiscount: null,
      total,
    },
  ];
}

// ---------------------------------------------------------------------------
// Cupao
// ---------------------------------------------------------------------------

export interface CupaoAplicado {
  couponId: string;
  couponCode: string;
  couponDiscount: number;
  linhas: LinhaCalculada[];
}

/**
 * Confere o cupao contra as linhas e devolve-as com o desconto ja no
 * `unitPrice`. Lanca com a mensagem para o cliente quando nao vale.
 *
 * `clienteId`: o cliente que ja existe, ou `null` se a encomenda e de um
 * cliente novo (nunca usou nada) ou sem cliente (`temCliente` falso).
 */
export async function aplicarCupaoAsLinhas(
  codigo: string,
  linhas: LinhaCalculada[],
  cliente: { id: string | null; temCliente: boolean },
  dia: string,
  cfg: CurrencyConfig,
): Promise<CupaoAplicado> {
  const code = normalizarCodigo(codigo);
  const c = await prisma.coupon.findUnique({ where: { code }, include: { recipes: { select: { recipeId: true } } } });
  if (!c) throw new Error(`Nao existe o cupao ${code}.`);

  const naoCanceladas = { couponId: c.id, status: { not: 'CANCELLED' as const } };
  const [total, doCliente] = await Promise.all([
    prisma.customerOrder.count({ where: naoCanceladas }),
    cliente.id ? prisma.customerOrder.count({ where: { ...naoCanceladas, customerId: cliente.id } }) : Promise.resolve(0),
  ]);

  const input: CupaoInput = {
    code: c.code,
    kind: c.kind,
    value: num(c.value),
    minOrder: c.minOrder == null ? null : num(c.minOrder),
    startsAt: diaDaColuna(c.startsAt),
    endsAt: c.endsAt ? diaDaColuna(c.endsAt) : null,
    maxUses: c.maxUses,
    maxUsesPerCustomer: c.maxUsesPerCustomer,
    allItems: c.allItems,
    recipeIds: c.recipes.map((r) => r.recipeId),
    stacksWithPromotions: c.stacksWithPromotions,
    active: c.active,
  };
  const r = aplicarCupao(input, linhas, { total, doCliente, temCliente: cliente.temCliente }, dia, cfg);
  if (!r.ok) throw new Error(r.motivo);

  return {
    couponId: c.id,
    couponCode: c.code,
    couponDiscount: r.total,
    linhas: linhas.map((l, i) => {
      const desc = r.descontos[i];
      if (!desc) return l;
      return {
        ...l,
        unitPrice: Math.round(((l.total - desc) / l.qty) * 10_000) / 10_000,
        couponDiscount: desc,
        total: centimos(l.total - desc),
      };
    }),
  };
}

/** A linha como entra na base (sem o `total`, que e so das contas). */
export function paraGravar(l: LinhaCalculada) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { total, ...resto } = l;
  return resto;
}
