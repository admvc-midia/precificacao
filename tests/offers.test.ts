import { describe, expect, it } from 'vitest';

import {
  bestOfferForNeed,
  findSimilarNames,
  rankOffers,
  type SupplierOffer,
} from '@/lib/pricing/offers';

const oferta = (
  supplierName: string,
  purchasePrice: number,
  purchaseQty: number,
  purchaseUnit: SupplierOffer['purchaseUnit'],
  inUse = false,
): SupplierOffer => ({
  id: supplierName,
  supplierId: supplierName,
  supplierName,
  purchasePrice,
  purchaseQty,
  purchaseUnit,
  inUse,
});

describe('comparar fornecedores', () => {
  it('normaliza embalagens diferentes para o mesmo custo por grama', () => {
    const r = rankOffers([
      oferta('Talho', 12.5, 5, 'KG'), // 0,0025/g
      oferta('Mercado', 3.2, 1, 'KG'), // 0,0032/g
      oferta('Makro', 14.9, 5, 'KG'), // 0,00298/g
    ]);

    expect(r.map((o) => o.supplierName)).toEqual(['Talho', 'Makro', 'Mercado']);
    expect(r[0].unitCost).toBeCloseTo(0.0025, 10);
    expect(r[0].cheapest).toBe(true);
  });

  it('compara entre unidades diferentes', () => {
    // 1 L a 2,00 e 500 ml a 1,20: o litro sai mais barato por ml.
    const r = rankOffers([oferta('A', 2, 1, 'L'), oferta('B', 1.2, 500, 'ML')]);
    expect(r[0].supplierName).toBe('A');
    expect(r[0].unitCost).toBeCloseTo(0.002, 10);
    expect(r[1].unitCost).toBeCloseTo(0.0024, 10);
  });

  it('diz quanto mais caro e cada alternativa', () => {
    const r = rankOffers([oferta('Barato', 10, 1, 'KG'), oferta('Caro', 12, 1, 'KG')]);
    expect(r[0].premium).toBeCloseTo(0, 10);
    expect(r[1].premium).toBeCloseTo(0.2, 10);
  });

  it('ignora ofertas com quantidade invalida em vez de rebentar', () => {
    const r = rankOffers([oferta('Bom', 10, 1, 'KG'), oferta('Mau', 10, 0, 'KG')]);
    expect(r).toHaveLength(1);
    expect(r[0].supplierName).toBe('Bom');
  });

  it('lista vazia devolve lista vazia', () => {
    expect(rankOffers([])).toEqual([]);
  });
});

describe('onde comprar uma quantidade concreta', () => {
  const carne = [
    oferta('Talho', 12.5, 5, 'KG'), // barato por grama, embalagem grande
    oferta('Mercado', 3.2, 1, 'KG'), // caro por grama, embalagem pequena
  ];

  it('para pouca quantidade, a embalagem pequena ganha', () => {
    // Preciso de 1 kg. No Talho tinha de levar 5 kg por 12,50.
    const r = bestOfferForNeed(1000, carne)!;

    expect(r.cheapest.offer.supplierName).toBe('Mercado');
    expect(r.cheapest.cost).toBeCloseTo(3.2, 10);
    expect(r.cheapest.packs).toBe(1);
  });

  it('para muita quantidade, a embalagem grande ganha', () => {
    // Preciso de 10 kg: 2 pacotes de 5 kg por 25,00 contra 10 de 1 kg por 32,00.
    const r = bestOfferForNeed(10000, carne)!;

    expect(r.cheapest.offer.supplierName).toBe('Talho');
    expect(r.cheapest.cost).toBeCloseTo(25, 10);
    expect(r.cheapest.packs).toBe(2);
  });

  it('o mais barato por grama nem sempre e o mais barato na compra', () => {
    const porGrama = rankOffers(carne)[0];
    const naCompra = bestOfferForNeed(1000, carne)!.cheapest.offer;

    expect(porGrama.supplierName).toBe('Talho');
    expect(naCompra.supplierName).toBe('Mercado');
  });

  it('conta a sobra de quem compra embalagem a mais', () => {
    const r = bestOfferForNeed(1500, carne)!;
    const talho = r.options.find((o) => o.offer.supplierName === 'Talho')!;
    expect(talho.leftoverBase).toBeCloseTo(3500, 8);
  });

  it('respeita o fornecedor preferido e diz quanto ele custa', () => {
    const comPreferido = [
      oferta('Talho', 12.5, 5, 'KG', true), // preferido por qualidade
      oferta('Mercado', 3.2, 1, 'KG'),
    ];

    const r = bestOfferForNeed(1000, comPreferido)!;

    expect(r.cheapest.offer.supplierName).toBe('Mercado');
    expect(r.recommended.offer.supplierName).toBe('Talho');
    expect(r.inUse!.offer.supplierName).toBe('Talho');
    // Seguir a preferencia custa 12,50 - 3,20.
    expect(r.costOfPreference).toBeCloseTo(9.3, 10);
  });

  it('quando o preferido ja e o mais barato, nao ha custo de preferencia', () => {
    const r = bestOfferForNeed(10000, [
      oferta('Talho', 12.5, 5, 'KG', true),
      oferta('Mercado', 3.2, 1, 'KG'),
    ])!;

    expect(r.recommended.offer.supplierName).toBe('Talho');
    expect(r.inUse).toBeNull();
    expect(r.costOfPreference).toBeCloseTo(0, 10);
  });

  it('desempata pela menor sobra', () => {
    // Mesmo custo para 1 kg, mas um deixa 4 kg parados e o outro nada.
    const r = bestOfferForNeed(1000, [
      oferta('Grande', 5, 5, 'KG'),
      oferta('Justo', 5, 1, 'KG'),
    ])!;
    expect(r.cheapest.offer.supplierName).toBe('Justo');
  });

  it('sem necessidade nao ha decisao', () => {
    expect(bestOfferForNeed(0, carne)).toBeNull();
  });

  it('sem ofertas nao ha decisao', () => {
    expect(bestOfferForNeed(1000, [])).toBeNull();
  });
});

describe('nomes parecidos', () => {
  const existentes = [
    'Carne picada 20% gordura',
    'Queijo cheddar fatiado',
    'Tomate',
    'Pao de hamburguer',
  ];

  it('apanha o mesmo nome com acentos e maiusculas diferentes', () => {
    expect(findSimilarNames('TOMATE', existentes)).toContain('Tomate');
    expect(findSimilarNames('Pão de hambúrguer', existentes)).toContain(
      'Pao de hamburguer',
    );
  });

  it('apanha um nome contido no outro', () => {
    expect(findSimilarNames('Queijo', existentes)).toContain('Queijo cheddar fatiado');
  });

  it('apanha gralhas de uma letra', () => {
    expect(findSimilarNames('Tomate cerej', ['Tomate cereja'])).toContain(
      'Tomate cereja',
    );
  });

  it('nao confunde produtos que sao mesmo diferentes', () => {
    expect(findSimilarNames('Alface', existentes)).toEqual([]);
    expect(findSimilarNames('Oleo de girassol', existentes)).toEqual([]);
  });

  it('nomes muito curtos nao geram aviso', () => {
    // "Sal" e "Sol" sao duas coisas; avisar aqui seria so ruido.
    expect(findSimilarNames('Sal', ['Sol'])).toEqual([]);
  });

  it('nao avisa contra uma lista vazia', () => {
    expect(findSimilarNames('Qualquer coisa', [])).toEqual([]);
  });
});
