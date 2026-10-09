import { describe, expect, it } from 'vitest';

import { abertaSemSessao, rotaPermitida } from '@/lib/auth';
import { caminhoDaFoto, fotoDaSecaoSrc, fotoPublicaSrc } from '@/lib/cardapio/fotos';
import { lerTexto, trechos } from '@/lib/cardapio/texto';
import { MODELO_DO_PDF } from '@/lib/cardapio/modelo';
import {
  aplicarCupao,
  cmvReal,
  simularCmvDoCupao,
  avisoDePreco,
  centimos,
  descreverPromocao,
  estadoNoDia,
  mensagemDoCardapio,
  normalizarCodigo,
  numeroWhatsApp,
  precoDaLinha,
  precoRiscado,
  problemaNaPromocao,
  repartir,
  repartirCombo,
  totalComPromocao,
  CODIGO_VALIDO,
  type CupaoInput,
  type PromocaoInput,
} from '@/lib/pricing/cardapio';

const EUR = { currency: 'EUR', locale: 'pt-PT' };
/** O Intl poe espaco nao-quebravel antes do simbolo. */
const limpo = (s: string) => s.replace(/ /g, ' ');

function promo(p: Partial<PromocaoInput>): PromocaoInput {
  return {
    id: 'p',
    name: 'Promo',
    kind: 'PERCENT',
    value: null,
    buyQty: null,
    payQty: null,
    minQty: null,
    startsAt: '2026-10-01',
    endsAt: null,
    active: true,
    menuItemIds: ['bri'],
    ...p,
  };
}

describe('datas das promocoes e cupoes', () => {
  const p = { startsAt: '2026-10-10', endsAt: '2026-10-20', active: true };
  it('o primeiro e o ultimo dia contam', () => {
    expect(estadoNoDia(p, '2026-10-10')).toBe('ativa');
    expect(estadoNoDia(p, '2026-10-20')).toBe('ativa');
  });
  it('antes e agendada, depois e terminada', () => {
    expect(estadoNoDia(p, '2026-10-09')).toBe('agendada');
    expect(estadoNoDia(p, '2026-10-21')).toBe('terminada');
  });
  it('sem fim nunca termina; desligada ganha a tudo', () => {
    expect(estadoNoDia({ ...p, endsAt: null }, '2030-01-01')).toBe('ativa');
    expect(estadoNoDia({ ...p, active: false }, '2026-10-15')).toBe('desligada');
  });
});

describe('totalComPromocao', () => {
  it('percentagem', () => {
    expect(totalComPromocao(promo({ kind: 'PERCENT', value: 0.15 }), 10, 2)).toBeCloseTo(17);
  });
  it('valor por unidade nunca abaixo de zero', () => {
    expect(totalComPromocao(promo({ kind: 'AMOUNT', value: 0.5 }), 2, 3)).toBeCloseTo(4.5);
    expect(totalComPromocao(promo({ kind: 'AMOUNT', value: 5 }), 2, 3)).toBe(0);
  });
  it('leve 12 pague 10 conta por lotes', () => {
    const p = promo({ kind: 'BUY_X_PAY_Y', buyQty: 12, payQty: 10 });
    expect(totalComPromocao(p, 1.5, 11)).toBeNull(); // nao chega a um lote
    expect(totalComPromocao(p, 1.5, 12)).toBeCloseTo(15);
    expect(totalComPromocao(p, 1.5, 25)).toBeCloseTo((20 + 1) * 1.5); // 2 lotes + 1
  });
  it('preco por quantidade so a partir do minimo', () => {
    const p = promo({ kind: 'QTY_PRICE', minQty: 50, value: 0.9 });
    expect(totalComPromocao(p, 1.2, 49)).toBeNull();
    expect(totalComPromocao(p, 1.2, 50)).toBeCloseTo(45);
  });
});

describe('precoDaLinha', () => {
  const dia = '2026-10-15';
  it('sem promocao fica o preco do cardapio', () => {
    const r = precoDaLinha('bri', 1.5, 4, [], dia);
    expect(r).toMatchObject({ unitPrice: 1.5, total: 6, promotionId: null });
  });
  it('escolhe a promocao mais barata para o cliente; nao somam', () => {
    const r = precoDaLinha(
      'bri',
      1.5,
      12,
      [
        promo({ id: 'pct', name: '10%', kind: 'PERCENT', value: 0.1 }), // 16,20
        promo({ id: 'lote', name: 'Leve 12', kind: 'BUY_X_PAY_Y', buyQty: 12, payQty: 10 }), // 15,00
      ],
      dia,
    );
    expect(r.promotionId).toBe('lote');
    expect(r.total).toBe(15);
    expect(r.unitPrice).toBeCloseTo(1.25);
    expect(r.listPrice).toBe(1.5);
  });
  it('ignora promocoes de outros itens, desligadas ou fora de data', () => {
    const r = precoDaLinha(
      'bri',
      1.5,
      1,
      [
        promo({ value: 0.5, menuItemIds: ['outro'] }),
        promo({ value: 0.5, active: false }),
        promo({ value: 0.5, startsAt: '2026-11-01' }),
      ],
      dia,
    );
    expect(r.promotionId).toBeNull();
  });
  it('item que nao esta no cardapio nao tem promocao', () => {
    expect(precoDaLinha(null, 1.5, 1, [promo({ value: 0.5 })], dia).promotionId).toBeNull();
  });
});

describe('precoRiscado e descricoes', () => {
  it('so percentagem e valor dao preco riscado', () => {
    const ps = [promo({ kind: 'BUY_X_PAY_Y', buyQty: 3, payQty: 2 }), promo({ id: 'x', kind: 'PERCENT', value: 0.2 })];
    expect(precoRiscado('bri', 10, ps, '2026-10-15')?.unitPrice).toBeCloseTo(8);
    expect(precoRiscado('bri', 10, [ps[0]], '2026-10-15')).toBeNull();
  });
  it('descricoes curtas para as etiquetas', () => {
    expect(descreverPromocao(promo({ kind: 'PERCENT', value: 0.15 }), EUR)).toBe('-15%');
    expect(descreverPromocao(promo({ kind: 'BUY_X_PAY_Y', buyQty: 12, payQty: 10 }), EUR)).toBe('Leve 12, pague 10');
    expect(limpo(descreverPromocao(promo({ kind: 'QTY_PRICE', minQty: 50, value: 0.9 }), EUR))).toBe(
      'A partir de 50: 0,90 € cada',
    );
  });
  it('valida os campos do tipo', () => {
    const base = { startsAt: '2026-10-01', endsAt: null, value: null, buyQty: null, payQty: null, minQty: null };
    expect(problemaNaPromocao({ ...base, kind: 'PERCENT', value: 1.5 })).toMatch(/percentagem/);
    expect(problemaNaPromocao({ ...base, kind: 'BUY_X_PAY_Y', buyQty: 3, payQty: 3 })).toMatch(/pague/);
    expect(problemaNaPromocao({ ...base, kind: 'QTY_PRICE', minQty: 10, value: 1 })).toBeNull();
    expect(problemaNaPromocao({ ...base, kind: 'PERCENT', value: 0.1, endsAt: '2026-09-01' })).toMatch(/fim/);
  });
});

describe('repartir e combos', () => {
  it('a soma bate sempre ao centimo', () => {
    const r = repartir(10, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(10);
    expect(r).toEqual([3.34, 3.33, 3.33]);
  });
  it('pesos a zero repartem por igual', () => {
    expect(repartir(1, [0, 0])).toEqual([0.5, 0.5]);
  });
  it('combo reparte o preco pelo valor de cada ficha', () => {
    // Bolo 20 € + 6 brigadeiros a 1,50 € = 29 €; o combo custa 25 €.
    const linhas = repartirCombo(25, 2, [
      { recipeId: 'bolo', qty: 1, refPrice: 20 },
      { recipeId: 'bri', qty: 6, refPrice: 1.5 },
    ]);
    expect(linhas.map((l) => l.qty)).toEqual([2, 12]);
    expect(centimos(linhas.reduce((a, l) => a + l.total, 0))).toBe(50);
    expect(linhas[0].total).toBeCloseTo(34.48, 2);
  });
});

describe('aplicarCupao', () => {
  const cupao: CupaoInput = {
    code: 'BEMVINDA10',
    kind: 'PERCENT',
    value: 0.1,
    minOrder: null,
    startsAt: '2026-10-01',
    endsAt: '2026-10-31',
    maxUses: null,
    maxUsesPerCustomer: null,
    allItems: true,
    recipeIds: [],
    stacksWithPromotions: false,
    active: true,
  };
  const usos = { total: 0, doCliente: 0, temCliente: true };
  const linhas = [
    { recipeId: 'bolo', total: 50, promotionId: null },
    { recipeId: 'bri', total: 15, promotionId: 'lote' },
  ];
  const dia = '2026-10-15';

  it('percentagem so nas linhas sem promocao', () => {
    const r = aplicarCupao(cupao, linhas, usos, dia, EUR);
    expect(r).toEqual({ ok: true, descontos: [5, 0], total: 5 });
  });
  it('junta-se a promocoes quando o cupao deixa', () => {
    const r = aplicarCupao({ ...cupao, stacksWithPromotions: true }, linhas, usos, dia, EUR);
    expect(r).toMatchObject({ ok: true, total: 6.5 });
  });
  it('valor fixo reparte-se e nunca passa do que ha', () => {
    const r = aplicarCupao({ ...cupao, kind: 'AMOUNT', value: 100, stacksWithPromotions: true }, linhas, usos, dia, EUR);
    expect(r).toMatchObject({ ok: true, total: 65 });
  });
  it('so os produtos da lista', () => {
    const r = aplicarCupao({ ...cupao, allItems: false, recipeIds: ['bolo'] }, linhas, usos, dia, EUR);
    expect(r).toMatchObject({ ok: true, descontos: [5, 0] });
  });
  it('recusas com o motivo', () => {
    const motivo = (c: Partial<CupaoInput>, u = usos, d = dia) => {
      const r = aplicarCupao({ ...cupao, ...c }, linhas, u, d, EUR);
      return r.ok ? null : limpo(r.motivo);
    };
    expect(motivo({}, usos, '2026-11-01')).toMatch(/terminou a 31\/10\/2026/);
    expect(motivo({}, usos, '2026-09-30')).toMatch(/a partir de 01\/10\/2026/);
    expect(motivo({ active: false })).toMatch(/desligado/);
    expect(motivo({ maxUses: 3 }, { ...usos, total: 3 })).toMatch(/3 de 3/);
    expect(motivo({ maxUsesPerCustomer: 1 }, { ...usos, doCliente: 1 })).toMatch(/ja usou/);
    expect(motivo({ maxUsesPerCustomer: 1 }, { ...usos, temCliente: false })).toMatch(/escolha o cliente/);
    expect(motivo({ minOrder: 80 })).toMatch(/80,00 €/);
    expect(motivo({ allItems: false, recipeIds: ['outro'] })).toMatch(/nenhum produto/);
    expect(motivo({ allItems: false, recipeIds: ['bri'] })).toMatch(/promocao/);
  });
  it('codigos arrumados', () => {
    expect(normalizarCodigo(' bem-vinda 10 ')).toBe('BEM-VINDA10');
    expect(normalizarCodigo('Natal')).toBe('NATAL');
    expect(normalizarCodigo('promoção')).toBe('PROMOCAO');
    expect(CODIGO_VALIDO.test('A')).toBe(false);
    expect(CODIGO_VALIDO.test('NATAL25')).toBe(true);
  });
});

describe('aviso de preco e WhatsApp', () => {
  it('avisa so quando a tabela difere ao centimo', () => {
    expect(avisoDePreco(25, 25.004)).toBeNull();
    expect(avisoDePreco(25, null)).toBeNull();
    expect(avisoDePreco(25, 27.5)).toMatchObject({ diferenca: 2.5 });
  });
  it('numero do WhatsApp', () => {
    expect(numeroWhatsApp('924 005 977')).toBe('351924005977');
    expect(numeroWhatsApp('+351 924 005 977')).toBe('351924005977');
    expect(numeroWhatsApp('0055 11 91234 5678')).toBe('5511912345678');
    expect(numeroWhatsApp('123')).toBeNull();
  });
  it('a mensagem leva a lista, o total e o cupao', () => {
    const m = limpo(
      mensagemDoCardapio(
        [
          { nome: 'Bolo 16 cm', qty: 1, total: 50 },
          { nome: 'Brigadeiro', qty: 0, total: 0 },
          { nome: 'Caseirinho Coco', qty: 2, total: 50 },
        ],
        ' natal ',
        EUR,
      ),
    );
    expect(m).toContain('• 1 × Bolo 16 cm — 50,00 €');
    expect(m).not.toContain('Brigadeiro');
    expect(m).toContain('Total estimado: 100,00 €');
    expect(m).toContain('Cupão: NATAL');
  });
});

describe('texto do cardapio', () => {
  it('subtitulos, pilulas, listas, destaques e notas', () => {
    const b = lerTexto('## Recheios (de 1 até 3 opções)\n- Baunilha\n- Chocolate\n\n### Pedidos\nLinha um\nlinha dois\n> Destaque\n~ *nota');
    expect(b.map((x) => x.tipo)).toEqual(['subtitulo', 'lista', 'pilula', 'paragrafo', 'destaque', 'nota']);
    expect(b[0]).toEqual({ tipo: 'subtitulo', texto: 'Recheios', aparte: '(de 1 até 3 opções)' });
    expect(b[1]).toMatchObject({ itens: [[{ texto: 'Baunilha' }], [{ texto: 'Chocolate' }]] });
    expect(b[3]).toMatchObject({ trechos: [{ texto: 'Linha um linha dois' }] });
  });
  it('negrito, e um ** sem par fica como esta', () => {
    expect(trechos('com **3 dias** de antecedência')).toEqual([
      { texto: 'com ', negrito: false },
      { texto: '3 dias', negrito: true },
      { texto: ' de antecedência', negrito: false },
    ]);
    expect(trechos('Pralinê**')).toEqual([{ texto: 'Pralinê**', negrito: false }]);
  });
  it('HTML e so texto', () => {
    const b = lerTexto('<script>alert(1)</script>');
    expect(b).toEqual([{ tipo: 'paragrafo', trechos: [{ texto: '<script>alert(1)</script>', negrito: false }] }]);
  });
  it('o modelo do PDF le-se sem perder nada', () => {
    const bolos = MODELO_DO_PDF[0];
    const b = lerTexto(bolos.body);
    expect(b.filter((x) => x.tipo === 'subtitulo').map((x) => (x as { texto: string }).texto)).toEqual([
      'Massa',
      'Recheios',
      'Decoração',
    ]);
    expect(MODELO_DO_PDF.find((s) => s.name === 'Caseirinhos')?.itens).toHaveLength(9);
  });
});

describe('rotas publicas', () => {
  it('o cardapio e as fotos dele abrem sem sessao; o resto nao', () => {
    expect(abertaSemSessao('/cardapio')).toBe(true);
    expect(abertaSemSessao('/api/cardapio/foto/abc123')).toBe(true);
    expect(abertaSemSessao('/api/cardapio/foto/secao/abc123')).toBe(true);
    expect(abertaSemSessao('/api/cardapio/foto/secao/abc/x')).toBe(false);
    expect(abertaSemSessao('/cardapio/x')).toBe(false);
    expect(abertaSemSessao('/api/cardapio/foto/abc/../../fotos/1')).toBe(false);
    expect(abertaSemSessao('/api/fotos/abc')).toBe(false);
    expect(abertaSemSessao('/loja/cardapio')).toBe(false);
    expect(abertaSemSessao('/loja/cupoes')).toBe(false);
  });
  it('so o dono entra na loja', () => {
    expect(rotaPermitida('OWNER', '/loja/cupoes')).toBe(true);
    expect(rotaPermitida('KITCHEN', '/loja/cardapio')).toBe(false);
    expect(rotaPermitida('READER', '/loja/promocoes')).toBe(false);
  });
});

describe('fotos do cardapio', () => {
  const sem = { photoPath: null, photoThumbPath: null };
  const ficha = { photoPath: 'fotos/ficha.jpg', photoThumbPath: 'fotos/ficha-mini.jpg' };
  const propria = { photoPath: 'cardapio/item.jpg', photoThumbPath: 'cardapio/item-mini.jpg' };

  it('a foto propria ganha a da ficha', () => {
    expect(caminhoDaFoto({ ...propria, recipe: ficha, components: [] })).toEqual(propria);
  });
  it('sem foto propria, a da ficha', () => {
    expect(caminhoDaFoto({ ...sem, recipe: ficha, components: [] })).toEqual(ficha);
  });
  it('num combo, a da primeira ficha com foto', () => {
    expect(
      caminhoDaFoto({ ...sem, recipe: null, components: [{ recipe: sem }, { recipe: ficha }] }),
    ).toEqual(ficha);
  });
  it('sem foto nenhuma, nulo', () => {
    expect(caminhoDaFoto({ ...sem, recipe: null, components: [] })).toBeNull();
    expect(caminhoDaFoto({ ...sem, recipe: sem, components: [] })).toBeNull();
  });
  it('os enderecos levam o fim do caminho, que muda com a foto', () => {
    expect(fotoPublicaSrc('i1', 'cardapio/i1-abcdef.jpg', 'mini')).toBe(
      '/api/cardapio/foto/i1?tam=mini&v=cardapio%2Fi1-abcdef.jpg',
    );
    expect(fotoDaSecaoSrc('s1', null)).toBeNull();
    expect(fotoDaSecaoSrc('s1', 'cardapio/s1.jpg')).toBe('/api/cardapio/foto/secao/s1?v=cardapio%2Fs1.jpg');
  });
});

describe('CMV depois do cupao', () => {
  // IVA incluido a 13%: o liquido e o preco / 1,13.
  const liquido = (v: number) => v / 1.13;
  const produtos = [
    { nome: 'Bolo', preco: 50, custo: 13.27 }, // CMV 30%
    { nome: 'Caixa', preco: 10, custo: 3.54 }, // CMV 40%
  ];
  it('percentagem: o pior produto', () => {
    const r = simularCmvDoCupao({ kind: 'PERCENT', value: 0.2, minOrder: null }, produtos, liquido);
    expect(r).toMatchObject({ nome: 'Caixa', comoSimulado: 'em cada produto' });
    if (!r || 'motivo' in r) throw new Error('esperava simulacao');
    expect(r.antes).toBeCloseTo(0.4, 2);
    expect(r.depois).toBeCloseTo(0.5, 2);
  });
  it('valor fixo: na encomenda minima; sem minimo, depende', () => {
    const r = simularCmvDoCupao({ kind: 'AMOUNT', value: 5, minOrder: 50 }, produtos, liquido);
    expect(r).toMatchObject({ nome: 'Caixa', comoSimulado: 'na encomenda mínima' });
    expect(simularCmvDoCupao({ kind: 'AMOUNT', value: 5, minOrder: null }, produtos, liquido)).toHaveProperty('motivo');
    expect(simularCmvDoCupao({ kind: 'PERCENT', value: 0.1, minOrder: null }, [], liquido)).toBeNull();
  });
  it('real: com e sem o desconto', () => {
    const r = cmvReal([{ qty: 2, unitPrice: 45, custo: 13.27 }], 10, liquido)!;
    expect(r.com).toBeCloseTo((26.54 * 1.13) / 90, 4);
    expect(r.sem).toBeCloseTo((26.54 * 1.13) / 100, 4);
    expect(cmvReal([], 0, liquido)).toBeNull();
  });
});
