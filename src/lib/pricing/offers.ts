/**
 * Comparar precos entre fornecedores.
 *
 * ---------------------------------------------------------------------------
 * PORQUE O PRECO POR GRAMA NAO CHEGA PARA DECIDIR
 * ---------------------------------------------------------------------------
 * O instinto e ordenar pelo custo por unidade base e comprar no mais barato.
 * Funciona quando se precisa de muito. Nao funciona quando se precisa de
 * pouco, porque nao se compra fracao de embalagem:
 *
 *   Preciso de 1 kg de carne.
 *   Talho:  12,50 EUR por 5 kg   ->  0,0025/g, mas tenho de levar 5 kg = 12,50
 *   Merc.:   3,20 EUR por 1 kg   ->  0,0032/g, e levo so 1 kg      =  3,20
 *
 * O "mais barato por grama" custava quatro vezes mais nesta compra. Por isso
 * ha duas funcoes: `rankOffers` para a ficha do insumo, onde a pergunta e
 * "quem vende mais barato", e `bestOfferForNeed` para a lista de compras,
 * onde a pergunta e "onde e que esta compra fica mais barata".
 *
 * E ha ainda a preferencia do utilizador. Quem escolhe um fornecedor por
 * qualidade ou prazo nao quer a aplicacao a discutir — quer saber quanto
 * custa essa escolha. Por isso a preferida ganha, e o que se poupava vai
 * escrito ao lado.
 */

import { toBase, type PurchaseUnit } from '@/lib/units';

export interface SupplierOffer {
  id: string;
  supplierId: string;
  supplierName: string;
  purchasePrice: number;
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  preferred: boolean;
}

export interface RankedOffer extends SupplierOffer {
  /** Tamanho da embalagem na unidade base. */
  packSizeBase: number;
  /** Custo por unidade base. */
  unitCost: number;
  cheapest: boolean;
  /** Quanto mais caro que o mais barato, em fracao. 0 no mais barato. */
  premium: number;
}

/**
 * Ordena as ofertas da mais barata por unidade base para a mais cara.
 *
 * Serve a ficha do insumo, onde se quer ver quem vende melhor — nao a
 * decisao de uma compra concreta, que depende da quantidade.
 */
export function rankOffers(offers: SupplierOffer[]): RankedOffer[] {
  const validas = offers
    .map((o) => {
      const packSizeBase = toBase(o.purchaseQty, o.purchaseUnit);
      return {
        ...o,
        packSizeBase,
        unitCost: packSizeBase > 0 ? o.purchasePrice / packSizeBase : Infinity,
        cheapest: false,
        premium: 0,
      };
    })
    .filter((o) => Number.isFinite(o.unitCost));

  if (validas.length === 0) return [];

  validas.sort((a, b) => a.unitCost - b.unitCost || a.supplierName.localeCompare(b.supplierName));

  const melhor = validas[0].unitCost;
  for (const o of validas) {
    o.cheapest = o.unitCost === melhor;
    o.premium = melhor > 0 ? o.unitCost / melhor - 1 : 0;
  }
  return validas;
}

export interface NeedQuote {
  offer: RankedOffer;
  /** Embalagens inteiras a comprar neste fornecedor. */
  packs: number;
  /** Quanto custa satisfazer a necessidade aqui. */
  cost: number;
  /** Quanto sobra em despensa se comprar aqui. */
  leftoverBase: number;
}

export interface BestForNeed {
  /** Onde esta compra fica mais barata. */
  cheapest: NeedQuote;
  /** O fornecedor marcado como preferido, se houver e se nao for o mais barato. */
  preferred: NeedQuote | null;
  /** Todas as opcoes, da mais barata para a mais cara nesta compra. */
  options: NeedQuote[];
  /**
   * O que se recomenda comprar: o preferido quando existe, senao o mais
   * barato. A aplicacao nao desfaz a escolha de quem trabalha na casa.
   */
  recommended: NeedQuote;
  /** Quanto custa seguir a preferencia em vez do mais barato. Zero se coincidem. */
  costOfPreference: number;
}

/**
 * Onde comprar uma quantidade concreta, contando embalagens inteiras.
 *
 * @param missingBase o que falta, na unidade base
 */
export function bestOfferForNeed(
  missingBase: number,
  offers: SupplierOffer[],
): BestForNeed | null {
  if (missingBase <= 0) return null;

  const ranked = rankOffers(offers);
  if (ranked.length === 0) return null;

  const options: NeedQuote[] = ranked.map((offer) => {
    // A tolerancia evita comprar uma embalagem a mais por erro de virgula
    // flutuante, como no resto da aplicacao.
    const packs = Math.ceil(missingBase / offer.packSizeBase - 1e-9);
    const comprado = packs * offer.packSizeBase;
    return {
      offer,
      packs,
      cost: packs * offer.purchasePrice,
      leftoverBase: Math.max(0, comprado - missingBase),
    };
  });

  // Empate no custo: menos sobra ganha, porque e menos dinheiro parado.
  options.sort((a, b) => a.cost - b.cost || a.leftoverBase - b.leftoverBase);

  const cheapest = options[0];
  const preferida = options.find((o) => o.offer.preferred) ?? null;
  const recommended = preferida ?? cheapest;

  return {
    cheapest,
    preferred: preferida && preferida !== cheapest ? preferida : null,
    options,
    recommended,
    costOfPreference: recommended.cost - cheapest.cost,
  };
}

// ---------------------------------------------------------------------------
// Nomes parecidos
// ---------------------------------------------------------------------------

/** Minusculas, sem acentos e sem pontuacao, para comparar nomes escritos a mao. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de edicao, limitada — acima do limite nao interessa o valor exato. */
function editDistance(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let melhorNaLinha = i;

    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + custo,
      );
      atual.push(v);
      if (v < melhorNaLinha) melhorNaLinha = v;
    }

    if (melhorNaLinha > limite) return limite + 1;
    anterior = atual;
  }

  return anterior[b.length];
}

/**
 * Nomes existentes suficientemente parecidos para serem a mesma coisa
 * escrita de duas maneiras.
 *
 * Apanha tres casos, que sao os que acontecem a escrever a mao: o mesmo nome
 * com acentos ou maiusculas diferentes, um nome contido no outro
 * ("Queijo" e "Queijo cheddar"), e gralhas de uma ou duas letras.
 *
 * Nao bloqueia nada — devolve os candidatos para a aplicacao **perguntar**.
 * Recusar um nome parecido impediria "Tomate" e "Tomate cereja" de
 * coexistirem, que e legitimo.
 */
export function findSimilarNames(
  name: string,
  existing: string[],
  limite = 2,
): string[] {
  const alvo = normalize(name);
  if (alvo.length < 3) return [];

  return existing.filter((outro) => {
    const n = normalize(outro);
    if (!n || n === alvo) return true;
    if (n.includes(alvo) || alvo.includes(n)) return true;
    // Em nomes curtos, duas letras de diferenca ja e outra palavra.
    const permitido = Math.min(limite, Math.floor(Math.max(alvo.length, n.length) / 4));
    return permitido > 0 && editDistance(alvo, n, permitido) <= permitido;
  });
}
