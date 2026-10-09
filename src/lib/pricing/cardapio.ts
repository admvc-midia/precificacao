/**
 * Cardapio publico, promocoes e cupoes: as contas, sem base de dados.
 *
 * Todos os precos estao na convencao de IVA das configuracoes (a mesma do
 * preco de tabela e de `CustomerOrderLine.unitPrice`). O publico ve-os com
 * IVA atraves de `grossOf`.
 *
 * Os dias sao "AAAA-MM-DD" em hora de Lisboa (`diaEmLisboa`), e as datas de
 * inicio e fim das promocoes e dos cupoes contam ambas.
 */

import { formatMoney, formatNumber, type CurrencyConfig } from '@/lib/money';

// ---------------------------------------------------------------------------
// Arredondamentos
// ---------------------------------------------------------------------------

/** Ao centimo, sem o 1.005 → 1.00 do ponto flutuante. */
export function centimos(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** A precisao da coluna `unitPrice` (Decimal(12,4)). */
function quatroCasas(v: number): number {
  return Math.round((v + Number.EPSILON) * 10_000) / 10_000;
}

/**
 * Reparte `total` (em centimos) por pesos, ao centimo, com a soma certa: o
 * que sobra do arredondamento vai para as maiores partes. Pesos todos a zero
 * repartem por igual.
 */
export function repartir(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const cents = Math.round(total * 100);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const base = soma > 0 ? pesos : pesos.map(() => 1);
  const somaBase = soma > 0 ? soma : pesos.length;

  const exatos = base.map((p) => (cents * p) / somaBase);
  const partes = exatos.map(Math.floor);
  let falta = cents - partes.reduce((a, b) => a + b, 0);
  // Os maiores restos primeiro; empate fica com a primeira linha.
  const ordem = exatos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    partes[i] += 1;
    falta -= 1;
  }
  return partes.map((c) => c / 100);
}

// ---------------------------------------------------------------------------
// Promocoes
// ---------------------------------------------------------------------------

export type PromotionKind = 'PERCENT' | 'AMOUNT' | 'BUY_X_PAY_Y' | 'QTY_PRICE';

export const PROMOCAO_LABEL: Record<PromotionKind, string> = {
  PERCENT: 'Percentagem',
  AMOUNT: 'Valor por unidade',
  BUY_X_PAY_Y: 'Leve X, pague Y',
  QTY_PRICE: 'Preço por quantidade',
};

export interface PromocaoInput {
  id: string;
  name: string;
  kind: PromotionKind;
  value: number | null;
  buyQty: number | null;
  payQty: number | null;
  minQty: number | null;
  /** "AAAA-MM-DD". */
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  menuItemIds: string[];
}

export type EstadoDaData = 'agendada' | 'ativa' | 'terminada' | 'desligada';

/** Em que ponto esta uma promocao (ou um cupao) num dia. */
export function estadoNoDia(
  p: { startsAt: string; endsAt: string | null; active: boolean },
  dia: string,
): EstadoDaData {
  if (!p.active) return 'desligada';
  if (dia < p.startsAt) return 'agendada';
  if (p.endsAt && dia > p.endsAt) return 'terminada';
  return 'ativa';
}

/**
 * O total de `qty` unidades a `price` com esta promocao, ou `null` quando
 * ela nao se aplica a esta quantidade (nao chega ao minimo, nao faz um lote).
 * Nunca abaixo de zero.
 */
export function totalComPromocao(p: PromocaoInput, price: number, qty: number): number | null {
  if (!(qty > 0) || !(price >= 0)) return null;
  switch (p.kind) {
    case 'PERCENT': {
      const v = p.value ?? 0;
      if (!(v > 0)) return null;
      return Math.max(0, price * qty * (1 - Math.min(v, 1)));
    }
    case 'AMOUNT': {
      const v = p.value ?? 0;
      if (!(v > 0)) return null;
      return Math.max(0, (price - v) * qty);
    }
    case 'BUY_X_PAY_Y': {
      const x = p.buyQty ?? 0;
      const y = p.payQty ?? 0;
      if (!(x > 0) || !(y >= 0) || y >= x) return null;
      const lotes = Math.floor(qty / x);
      if (lotes === 0) return null;
      return (lotes * y + (qty - lotes * x)) * price;
    }
    case 'QTY_PRICE': {
      const min = p.minQty ?? 0;
      const v = p.value;
      if (v == null || !(v >= 0) || qty < min) return null;
      return v * qty;
    }
  }
}

export interface PrecoDaLinha {
  /** O preco de cardapio, por unidade. */
  listPrice: number;
  /** O que fica por unidade, com a promocao (4 casas, como a coluna). */
  unitPrice: number;
  /** Ao centimo. */
  total: number;
  promotionId: string | null;
  promotionName: string | null;
}

/**
 * O preco de uma linha num dia: a promocao ativa que fica mais barata ao
 * cliente, ou o preco de cardapio. Promocoes nao se somam.
 */
export function precoDaLinha(
  menuItemId: string | null,
  price: number,
  qty: number,
  promos: PromocaoInput[],
  dia: string,
): PrecoDaLinha {
  const semPromo: PrecoDaLinha = {
    listPrice: price,
    unitPrice: price,
    total: centimos(price * qty),
    promotionId: null,
    promotionName: null,
  };
  if (!menuItemId || !(qty > 0)) return semPromo;

  let melhor: { p: PromocaoInput; total: number } | null = null;
  for (const p of promos) {
    if (!p.menuItemIds.includes(menuItemId)) continue;
    if (estadoNoDia(p, dia) !== 'ativa') continue;
    const t = totalComPromocao(p, price, qty);
    if (t == null) continue;
    const tc = centimos(t);
    if (tc < semPromo.total && (!melhor || tc < melhor.total)) melhor = { p, total: tc };
  }
  if (!melhor) return semPromo;
  return {
    listPrice: price,
    unitPrice: quatroCasas(melhor.total / qty),
    total: melhor.total,
    promotionId: melhor.p.id,
    promotionName: melhor.p.name,
  };
}

/** "-15%", "Leve 12, pague 10", "A partir de 50: 0,90 € cada". */
export function descreverPromocao(
  p: Pick<PromocaoInput, 'kind' | 'value' | 'buyQty' | 'payQty' | 'minQty'>,
  cfg: CurrencyConfig,
  /** Para mostrar o valor com IVA ao publico. */
  paraPublico: (v: number) => number = (v) => v,
): string {
  switch (p.kind) {
    case 'PERCENT':
      return `-${formatNumber((p.value ?? 0) * 100, cfg.locale, 0)}%`;
    case 'AMOUNT':
      return `-${formatMoney(paraPublico(p.value ?? 0), cfg)} por unidade`;
    case 'BUY_X_PAY_Y':
      return `Leve ${p.buyQty ?? 0}, pague ${p.payQty ?? 0}`;
    case 'QTY_PRICE':
      return `A partir de ${formatNumber(p.minQty ?? 0, cfg.locale, 0)}: ${formatMoney(paraPublico(p.value ?? 0), cfg)} cada`;
  }
}

/**
 * O preco por unidade de UMA unidade com promocao, para riscar no cardapio.
 * So as promocoes que valem a partir de uma unidade (percentagem, valor) dao
 * preco riscado; as outras mostram-se como etiqueta.
 */
export function precoRiscado(
  menuItemId: string,
  price: number,
  promos: PromocaoInput[],
  dia: string,
): { unitPrice: number; promo: PromocaoInput } | null {
  const doItem = promos.filter(
    (p) =>
      p.menuItemIds.includes(menuItemId) &&
      estadoNoDia(p, dia) === 'ativa' &&
      (p.kind === 'PERCENT' || p.kind === 'AMOUNT'),
  );
  let melhor: { unitPrice: number; promo: PromocaoInput } | null = null;
  for (const p of doItem) {
    const t = totalComPromocao(p, price, 1);
    if (t == null || t >= price) continue;
    if (!melhor || t < melhor.unitPrice) melhor = { unitPrice: t, promo: p };
  }
  return melhor;
}

/** As promocoes de lote/quantidade ativas num item, para etiquetas. */
export function promocoesDeQuantidade(
  menuItemId: string,
  promos: PromocaoInput[],
  dia: string,
): PromocaoInput[] {
  return promos.filter(
    (p) =>
      p.menuItemIds.includes(menuItemId) &&
      estadoNoDia(p, dia) === 'ativa' &&
      (p.kind === 'BUY_X_PAY_Y' || p.kind === 'QTY_PRICE'),
  );
}

/** Uma promocao com os campos que o tipo dela exige; senao, o que falta. */
export function problemaNaPromocao(p: Omit<PromocaoInput, 'id' | 'name' | 'active' | 'menuItemIds'>): string | null {
  if (p.endsAt && p.endsAt < p.startsAt) return 'O fim e antes do inicio.';
  switch (p.kind) {
    case 'PERCENT':
      if (!(p.value != null && p.value > 0 && p.value < 1)) return 'A percentagem tem de estar entre 0 e 100%.';
      return null;
    case 'AMOUNT':
      if (!(p.value != null && p.value > 0)) return 'Indique quanto se tira a cada unidade.';
      return null;
    case 'BUY_X_PAY_Y':
      if (!(p.buyQty != null && Number.isInteger(p.buyQty) && p.buyQty >= 2)) return 'O "leve" tem de ser um numero inteiro de pelo menos 2.';
      if (!(p.payQty != null && Number.isInteger(p.payQty) && p.payQty >= 1 && p.payQty < p.buyQty)) {
        return 'O "pague" tem de ser inteiro, pelo menos 1 e menor que o "leve".';
      }
      return null;
    case 'QTY_PRICE':
      if (!(p.minQty != null && p.minQty >= 2)) return 'A quantidade minima tem de ser pelo menos 2.';
      if (!(p.value != null && p.value > 0)) return 'Indique o preco de cada unidade.';
      return null;
  }
}

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export interface LinhaDeCombo {
  recipeId: string;
  qty: number;
  unitPrice: number;
  /** Ao centimo; a soma das linhas e o preco do combo vezes as unidades. */
  total: number;
}

/**
 * Desdobra `unidades` combos nas fichas que leva. O preco do combo
 * reparte-se em proporcao ao preco de referencia de cada ficha (o do
 * cardapio, ou o de tabela) vezes a quantidade, e a soma bate ao centimo.
 */
export function repartirCombo(
  precoDoCombo: number,
  unidades: number,
  componentes: Array<{ recipeId: string; qty: number; refPrice: number }>,
): LinhaDeCombo[] {
  if (componentes.length === 0 || !(unidades > 0)) return [];
  const totais = repartir(
    precoDoCombo * unidades,
    componentes.map((c) => Math.max(0, c.refPrice) * c.qty),
  );
  return componentes.map((c, i) => {
    const qty = c.qty * unidades;
    return { recipeId: c.recipeId, qty, unitPrice: quatroCasas(totais[i] / qty), total: totais[i] };
  });
}

// ---------------------------------------------------------------------------
// Cupoes
// ---------------------------------------------------------------------------

export type CouponKind = 'PERCENT' | 'AMOUNT';

export interface CupaoInput {
  code: string;
  kind: CouponKind;
  value: number;
  minOrder: number | null;
  startsAt: string;
  endsAt: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  allItems: boolean;
  recipeIds: string[];
  stacksWithPromotions: boolean;
  active: boolean;
}

export interface LinhaParaCupao {
  recipeId: string;
  /** Total da linha depois da promocao, ao centimo. */
  total: number;
  promotionId: string | null;
}

export type ResultadoDoCupao =
  | { ok: true; descontos: number[]; total: number }
  | { ok: false; motivo: string };

/** "  bem-vinda 10 " → "BEM-VINDA10". */
export function normalizarCodigo(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

export const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

/**
 * Aplica o cupao as linhas de uma encomenda. Devolve o desconto de cada
 * linha (ao centimo, na mesma ordem) ou o motivo por que nao vale — escrito
 * para se dizer ao cliente.
 */
export function aplicarCupao(
  c: CupaoInput,
  linhas: LinhaParaCupao[],
  usos: { total: number; doCliente: number; temCliente: boolean },
  dia: string,
  cfg: CurrencyConfig,
): ResultadoDoCupao {
  const estado = estadoNoDia(c, dia);
  if (estado === 'desligada') return { ok: false, motivo: `O cupao ${c.code} esta desligado.` };
  if (estado === 'agendada') return { ok: false, motivo: `O cupao ${c.code} so vale a partir de ${dataCurta(c.startsAt)}.` };
  if (estado === 'terminada') return { ok: false, motivo: `O cupao ${c.code} terminou a ${dataCurta(c.endsAt!)}.` };

  if (c.maxUses != null && usos.total >= c.maxUses) {
    return { ok: false, motivo: `O cupao ${c.code} ja foi usado ${usos.total} de ${c.maxUses} vezes.` };
  }
  if (c.maxUsesPerCustomer != null) {
    if (!usos.temCliente) return { ok: false, motivo: `O cupao ${c.code} tem limite por cliente: escolha o cliente.` };
    if (usos.doCliente >= c.maxUsesPerCustomer) {
      return {
        ok: false,
        motivo: `Este cliente ja usou o cupao ${c.code} ${usos.doCliente === 1 ? '1 vez' : `${usos.doCliente} vezes`}.`,
      };
    }
  }

  const totalDaEncomenda = linhas.reduce((a, l) => a + l.total, 0);
  if (c.minOrder != null && totalDaEncomenda + 0.000001 < c.minOrder) {
    return { ok: false, motivo: `O cupao ${c.code} exige uma encomenda de pelo menos ${formatMoney(c.minOrder, cfg)}.` };
  }

  const elegivel = linhas.map(
    (l) =>
      (c.allItems || c.recipeIds.includes(l.recipeId)) &&
      (c.stacksWithPromotions || !l.promotionId) &&
      l.total > 0,
  );
  if (!elegivel.some(Boolean)) {
    const algumDaLista = linhas.some((l) => c.allItems || c.recipeIds.includes(l.recipeId));
    return {
      ok: false,
      motivo: algumDaLista
        ? `O cupao ${c.code} nao se junta a promocoes, e os produtos dele ja estao em promocao.`
        : `O cupao ${c.code} nao se aplica a nenhum produto desta encomenda.`,
    };
  }

  let descontos: number[];
  if (c.kind === 'PERCENT') {
    const v = Math.min(Math.max(c.value, 0), 1);
    descontos = linhas.map((l, i) => (elegivel[i] ? centimos(l.total * v) : 0));
  } else {
    const base = linhas.reduce((a, l, i) => a + (elegivel[i] ? l.total : 0), 0);
    const tirar = Math.min(Math.max(c.value, 0), base);
    descontos = repartir(
      tirar,
      linhas.map((l, i) => (elegivel[i] ? l.total : 0)),
    );
  }
  return { ok: true, descontos, total: centimos(descontos.reduce((a, b) => a + b, 0)) };
}

/** "-10%" ou "-5,00 €". */
export function descreverCupao(c: Pick<CupaoInput, 'kind' | 'value'>, cfg: CurrencyConfig): string {
  return c.kind === 'PERCENT'
    ? `-${formatNumber(c.value * 100, cfg.locale, 0)}%`
    : `-${formatMoney(c.value, cfg)}`;
}

// ---------------------------------------------------------------------------
// Preco proprio do cardapio
// ---------------------------------------------------------------------------

/**
 * A diferenca entre o preco publicado e o de tabela, ou `null` quando sao
 * iguais ao centimo (ou nao ha preco de tabela).
 */
export function avisoDePreco(
  publicado: number,
  tabela: number | null,
): { diferenca: number; percent: number } | null {
  if (tabela == null || !Number.isFinite(tabela) || tabela <= 0) return null;
  const diferenca = centimos(tabela - publicado);
  if (Math.abs(diferenca) < 0.01) return null;
  return { diferenca, percent: (tabela - publicado) / publicado };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * O numero para o wa.me: so digitos, com indicativo. Um numero portugues de
 * 9 digitos ganha o 351; "00" no inicio sai.
 */
export function numeroWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && /^[29]/.test(d)) d = `351${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** A mensagem que o cliente manda a partir do cardapio. */
export function mensagemDoCardapio(
  itens: Array<{ nome: string; qty: number; total: number }>,
  cupao: string | null,
  cfg: CurrencyConfig,
): string {
  const linhas = itens
    .filter((i) => i.qty > 0)
    .map((i) => `• ${formatNumber(i.qty, cfg.locale, 0)} × ${i.nome} — ${formatMoney(i.total, cfg)}`);
  const total = itens.reduce((a, i) => a + (i.qty > 0 ? i.total : 0), 0);
  const partes = ['Olá! Gostava de encomendar:', '', ...linhas, '', `Total estimado: ${formatMoney(total, cfg)}`];
  const codigo = cupao ? normalizarCodigo(cupao) : '';
  if (codigo) partes.push(`Cupão: ${codigo}`);
  partes.push('', 'Para quando: ');
  return partes.join('\n');
}

function dataCurta(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// CMV depois do cupao
// ---------------------------------------------------------------------------
//
// A mesma conta das Promocoes: custo primo (ingredientes + embalagem) a
// dividir pela receita sem IVA. `liquido` tira o IVA a um preco na convencao
// das configuracoes.

export interface ProdutoParaCmv {
  nome: string;
  /** Preco de venda por unidade (cardapio, ou tabela), na convencao do IVA. */
  preco: number;
  /** Custo primo por unidade. */
  custo: number;
}

export type SimulacaoDoCupao =
  | { nome: string; antes: number; depois: number; comoSimulado: string }
  | { motivo: string };

/**
 * O pior CMV que o cupao deixa num produto a que se aplica (o que mais se
 * aproxima do prejuizo). Percentagem: em cada produto. Valor fixo: na
 * encomenda minima, se houver — sem ela, depende do tamanho da encomenda.
 */
export function simularCmvDoCupao(
  c: Pick<CupaoInput, 'kind' | 'value' | 'minOrder'>,
  produtos: ProdutoParaCmv[],
  liquido: (v: number) => number,
): SimulacaoDoCupao | null {
  const validos = produtos.filter((p) => p.preco > 0 && p.custo > 0);
  if (validos.length === 0) return null;
  let fracao: number;
  let comoSimulado: string;
  if (c.kind === 'PERCENT') {
    fracao = Math.min(Math.max(c.value, 0), 1);
    comoSimulado = 'em cada produto';
  } else {
    if (!c.minOrder || c.minOrder <= 0) {
      return { motivo: 'Valor fixo sem encomenda mínima: o CMV depende do tamanho da encomenda.' };
    }
    fracao = Math.min(c.value / c.minOrder, 1);
    comoSimulado = 'na encomenda mínima';
  }
  let pior: { nome: string; antes: number; depois: number } | null = null;
  for (const p of validos) {
    const depoisPreco = p.preco * (1 - fracao);
    const depois = depoisPreco > 0 ? p.custo / liquido(depoisPreco) : Infinity;
    if (!pior || depois > pior.depois) pior = { nome: p.nome, antes: p.custo / liquido(p.preco), depois };
  }
  return { ...pior!, comoSimulado };
}

/** O CMV real das encomendas que usaram o cupao, e o que seria sem o desconto. */
export function cmvReal(
  linhas: Array<{ qty: number; unitPrice: number; custo: number }>,
  descontado: number,
  liquido: (v: number) => number,
): { com: number; sem: number } | null {
  const custo = linhas.reduce((a, l) => a + l.qty * l.custo, 0);
  const receita = linhas.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  if (!(receita > 0) || !(custo > 0)) return null;
  return { com: custo / liquido(receita), sem: custo / liquido(receita + descontado) };
}
