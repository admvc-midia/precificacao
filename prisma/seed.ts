/**
 * Dados de arranque: uma lanchonete plausivel, com precos de Portugal.
 *
 * E o mesmo cenario verificado em tools/verify_pricing.py, para que os
 * numeros que aparecem na aplicacao logo apos a instalacao sejam os mesmos
 * que os testes conferem.
 *
 * ---------------------------------------------------------------------------
 * SO CORRE NUMA BASE VAZIA
 * ---------------------------------------------------------------------------
 * Chama-se a si proprio idempotente porque usa `upsert` por nome, e e verdade
 * para os dados que ele proprio cria. Mas numa base com dados a serio nao e
 * inofensivo:
 *
 *  - apaga as linhas de qualquer ficha cujo nome bata com uma das suas
 *    ("X-Burger Artesanal", "Coxinha de Frango"...) e substitui-as pelas de
 *    demonstracao;
 *  - apaga as cotacoes de preco do insumo de carne;
 *  - enche a lista de insumos, fornecedores e fichas com vinte e tal registos
 *    de mentira, que depois ha que distinguir dos verdadeiros um a um.
 *
 * Por isso recusa-se a correr quando encontra dados. Quem quiser mesmo,
 * acrescenta `--forcar` e sabe o que esta a fazer.
 */

import { PrismaClient, type PurchaseUnit } from '@prisma/client';

const prisma = new PrismaClient();

function baseUnitOf(unit: PurchaseUnit) {
  if (unit === 'KG' || unit === 'G') return 'G' as const;
  if (unit === 'L' || unit === 'ML') return 'ML' as const;
  return 'UN' as const;
}

/** Recusa-se a semear por cima de dados reais. */
async function confirmarBaseVazia(): Promise<void> {
  const contagem = {
    insumos: await prisma.ingredient.count(),
    fornecedores: await prisma.supplier.count(),
    fichas: await prisma.recipe.count(),
    despesas: await prisma.expense.count(),
    'movimentos de estoque': await prisma.stockMovement.count(),
    vendas: await prisma.salesRecord.count(),
  };

  const ocupado = Object.entries(contagem).filter(([, n]) => n > 0);
  if (ocupado.length === 0) return;

  if (process.argv.includes('--forcar')) {
    console.warn(
      'AVISO: a base ja tem dados e o seed vai correr na mesma, porque foi ' +
        'pedido com --forcar.\n' +
        '  Linhas de fichas com os nomes de demonstracao serao substituidas.',
    );
    return;
  }

  console.error('Esta base ja tem dados. O seed nao vai correr.\n');
  for (const [nome, n] of ocupado) {
    console.error(`  ${String(n).padStart(5)}  ${nome}`);
  }
  console.error(
    '\nO seed serve para uma instalacao nova. Aqui ele apagaria as linhas de\n' +
      'qualquer ficha com o nome de uma das suas, apagaria as cotacoes do\n' +
      'insumo de carne, e juntaria vinte e tal registos de demonstracao aos\n' +
      'seus, que depois teria de distinguir um a um.\n\n' +
      'Para esvaziar primeiro:  npx tsx prisma/reset-dados.mts --apply\n' +
      'Para semear mesmo assim: npx tsx prisma/seed.ts --forcar',
  );
  process.exit(1);
}

async function main() {
  await confirmarBaseVazia();

  // -------------------------------------------------------------------------
  // Configuracoes: Portugal, IVA de restauracao incluido no preco de menu.
  // -------------------------------------------------------------------------
  await prisma.settings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      businessName: 'Lanchonete do Bairro',
      currency: 'EUR',
      locale: 'pt-PT',
      vatRate: 0.13,
      vatMode: 'INCLUDED',
      fixedCostRate: 0.22,
      cardFeeRate: 0.012,
      targetCmv: 0.3,
      targetMargin: 0.15,
      rounding: 'ENDING_90',
    },
  });

  // -------------------------------------------------------------------------
  // Fornecedores
  // -------------------------------------------------------------------------
  const suppliers = await Promise.all(
    [
      { name: 'Continente', url: 'https://www.continente.pt' },
      { name: 'Pingo Doce', url: 'https://www.pingodoce.pt' },
      { name: 'Makro', url: 'https://www.makro.pt', notes: 'Grosso. Cartao obrigatorio.' },
      { name: 'Talho do Bairro', notes: 'Carne fresca, entrega as tercas.' },
    ].map((s) =>
      prisma.supplier.upsert({ where: { name: s.name }, update: s, create: s }),
    ),
  );
  const [continente, pingoDoce, makro, talho] = suppliers;

  // -------------------------------------------------------------------------
  // Insumos e embalagens
  // -------------------------------------------------------------------------
  const ingredientSeed = [
    // Carnes
    {
      name: 'Carne picada 20% gordura',
      supplierId: talho.id,
      purchasePrice: 12.5,
      purchaseQty: 5,
      purchaseUnit: 'KG' as PurchaseUnit,
      correctionFactor: 1,
      stockBase: 8000,
    },
    {
      name: 'Alcatra (para limpar)',
      supplierId: talho.id,
      purchasePrice: 18.0,
      purchaseQty: 1,
      purchaseUnit: 'KG' as PurchaseUnit,
      // 1 kg bruto rende 800 g limpos.
      correctionFactor: 1.25,
      stockBase: 0,
      notes: 'FC 1,25 — 20% de perda na limpeza.',
    },
    {
      name: 'Peito de frango',
      supplierId: makro.id,
      purchasePrice: 5.4,
      purchaseQty: 1,
      purchaseUnit: 'KG' as PurchaseUnit,
      correctionFactor: 1.08,
      stockBase: 3000,
    },
    // Secos e frescos
    {
      name: 'Pao de hamburguer',
      supplierId: continente.id,
      purchasePrice: 3.6,
      purchaseQty: 24,
      purchaseUnit: 'UN' as PurchaseUnit,
      correctionFactor: 1,
      stockBase: 48,
    },
    {
      name: 'Queijo cheddar fatiado',
      supplierId: makro.id,
      purchasePrice: 6.9,
      purchaseQty: 1,
      purchaseUnit: 'KG' as PurchaseUnit,
      correctionFactor: 1,
      stockBase: 2000,
    },
    {
      name: 'Alface',
      supplierId: pingoDoce.id,
      purchasePrice: 1.2,
      purchaseQty: 1,
      purchaseUnit: 'UN' as PurchaseUnit,
      // Folhas externas e talo vao fora.
      correctionFactor: 1.35,
      stockBase: 6,
    },
    {
      name: 'Tomate',
      supplierId: pingoDoce.id,
      purchasePrice: 1.79,
      purchaseQty: 1,
      purchaseUnit: 'KG' as PurchaseUnit,
      correctionFactor: 1.1,
      stockBase: 2000,
    },
    {
      name: 'Batata para fritar',
      supplierId: makro.id,
      purchasePrice: 8.9,
      purchaseQty: 2.5,
      purchaseUnit: 'KG' as PurchaseUnit,
      correctionFactor: 1,
      stockBase: 5000,
    },
    // Base da maionese
    { name: 'Ovo', supplierId: continente.id, purchasePrice: 2.4, purchaseQty: 12, purchaseUnit: 'UN' as PurchaseUnit, correctionFactor: 1, stockBase: 24 },
    { name: 'Oleo de girassol', supplierId: continente.id, purchasePrice: 2.0, purchaseQty: 1, purchaseUnit: 'L' as PurchaseUnit, correctionFactor: 1, stockBase: 3000 },
    { name: 'Mostarda', supplierId: continente.id, purchasePrice: 1.15, purchaseQty: 250, purchaseUnit: 'ML' as PurchaseUnit, correctionFactor: 1, stockBase: 500 },
    { name: 'Alho', supplierId: pingoDoce.id, purchasePrice: 0.89, purchaseQty: 100, purchaseUnit: 'G' as PurchaseUnit, correctionFactor: 1.15, stockBase: 200 },
    { name: 'Sal', supplierId: continente.id, purchasePrice: 0.45, purchaseQty: 1, purchaseUnit: 'KG' as PurchaseUnit, correctionFactor: 1, stockBase: 2000 },
  ];

  const packagingSeed = [
    { name: 'Caixa de hamburguer', supplierId: makro.id, purchasePrice: 12.0, purchaseQty: 100, purchaseUnit: 'UN' as PurchaseUnit },
    { name: 'Saco de transporte', supplierId: makro.id, purchasePrice: 8.0, purchaseQty: 100, purchaseUnit: 'UN' as PurchaseUnit },
    { name: 'Embalagem de batata', supplierId: makro.id, purchasePrice: 6.5, purchaseQty: 100, purchaseUnit: 'UN' as PurchaseUnit },
    { name: 'Guardanapo', supplierId: continente.id, purchasePrice: 1.8, purchaseQty: 200, purchaseUnit: 'UN' as PurchaseUnit },
  ];

  const ingredients = new Map<string, string>();

  for (const row of [
    ...ingredientSeed.map((r) => ({ ...r, category: 'FOOD' as const })),
    ...packagingSeed.map((r) => ({
      ...r,
      category: 'PACKAGING' as const,
      correctionFactor: 1,
      stockBase: 0,
    })),
  ]) {
    const qtyBase =
      row.purchaseUnit === 'KG' || row.purchaseUnit === 'L'
        ? row.purchaseQty * 1000
        : row.purchaseQty;

    const data = {
      ...row,
      baseUnit: baseUnitOf(row.purchaseUnit),
      // Estoque inicial com base de custo. Sem isto, as saidas desse saldo
      // valeriam zero no CMV real e o custo pareceria menor do que foi.
      avgCostBase: row.stockBase > 0 && qtyBase > 0 ? row.purchasePrice / qtyBase : 0,
    };
    const saved = await prisma.ingredient.upsert({
      where: { name_supplierId: { name: row.name, supplierId: row.supplierId } },
      update: data,
      create: data,
    });
    ingredients.set(row.name, saved.id);
  }

  const ing = (name: string) => {
    const id = ingredients.get(name);
    if (!id) throw new Error(`Insumo nao semeado: ${name}`);
    return id;
  };

  // -------------------------------------------------------------------------
  // Canais de venda
  // -------------------------------------------------------------------------
  const channelSeed = [
    {
      name: 'Balcao',
      kind: 'COUNTER' as const,
      commissionRate: 0,
      deliveryCost: 0,
      cardFeeRate: null,
      usesDeliveryPackaging: false,
      sortOrder: 0,
    },
    {
      name: 'Entrega propria',
      kind: 'OWN_DELIVERY' as const,
      commissionRate: 0,
      deliveryCost: 2.5,
      cardFeeRate: null,
      usesDeliveryPackaging: true,
      sortOrder: 1,
    },
    {
      name: 'Uber Eats',
      kind: 'PLATFORM' as const,
      commissionRate: 0.3,
      deliveryCost: 0,
      // A plataforma processa o pagamento: a taxa de cartao ja esta na comissao.
      cardFeeRate: 0,
      usesDeliveryPackaging: true,
      sortOrder: 2,
    },
    {
      name: 'Bolt Food',
      kind: 'PLATFORM' as const,
      commissionRate: 0.25,
      deliveryCost: 0,
      cardFeeRate: 0,
      usesDeliveryPackaging: true,
      sortOrder: 3,
    },
  ];

  for (const c of channelSeed) {
    await prisma.salesChannel.upsert({
      where: { name: c.name },
      update: c,
      create: c,
    });
  }

  // -------------------------------------------------------------------------
  // Fichas tecnicas
  // -------------------------------------------------------------------------

  /** Cria/atualiza uma ficha e substitui as suas linhas. */
  async function recipe(
    def: {
      name: string;
      kind: 'BASE' | 'PRODUCT';
      description?: string;
      yieldQty: number;
      yieldUnit: 'G' | 'ML' | 'UN';
      packaging?: string;
      deliveryPackaging?: string;
      pricingMode?: 'TARGET_CMV' | 'TARGET_MARGIN' | 'MANUAL';
      manualPrice?: number;
    },
    items: Array<{ ing?: string; rec?: string; qty: number; unit: PurchaseUnit }>,
    childIds: Map<string, string>,
  ) {
    const data = {
      name: def.name,
      kind: def.kind,
      description: def.description ?? null,
      yieldQty: def.yieldQty,
      yieldUnit: def.yieldUnit,
      packagingId: def.packaging ? ing(def.packaging) : null,
      deliveryPackagingId: def.deliveryPackaging ? ing(def.deliveryPackaging) : null,
      pricingMode: def.pricingMode ?? 'TARGET_CMV',
      manualPrice: def.manualPrice ?? null,
    };

    const saved = await prisma.recipe.upsert({
      where: { name: def.name },
      update: data,
      create: data,
    });

    // Substituicao total: o seed e a fonte da verdade para estas fichas.
    await prisma.recipeItem.deleteMany({ where: { recipeId: saved.id } });
    await prisma.recipeItem.createMany({
      data: items.map((item, i) => ({
        recipeId: saved.id,
        ingredientId: item.ing ? ing(item.ing) : null,
        childRecipeId: item.rec ? childIds.get(item.rec)! : null,
        qty: item.qty,
        unit: item.unit,
        sortOrder: i,
      })),
    });

    childIds.set(def.name, saved.id);
    return saved.id;
  }

  const ids = new Map<string, string>();

  // Preparacoes base primeiro: os produtos dependem delas.
  await recipe(
    {
      name: 'Maionese da casa',
      kind: 'BASE',
      description: 'Lote de 1,2 L. Rende cerca de 40 porcoes de 30 ml.',
      yieldQty: 1200,
      yieldUnit: 'ML',
    },
    [
      { ing: 'Ovo', qty: 4, unit: 'UN' },
      { ing: 'Oleo de girassol', qty: 1, unit: 'L' },
      { ing: 'Mostarda', qty: 30, unit: 'ML' },
      { ing: 'Alho', qty: 10, unit: 'G' },
      { ing: 'Sal', qty: 8, unit: 'G' },
    ],
    ids,
  );

  await recipe(
    {
      name: 'Batata frita tempero da casa',
      kind: 'BASE',
      description: 'Lote de 2 kg de batata ja temperada, pronta para fritar.',
      yieldQty: 2000,
      yieldUnit: 'G',
    },
    [
      { ing: 'Batata para fritar', qty: 2, unit: 'KG' },
      { ing: 'Sal', qty: 20, unit: 'G' },
      { ing: 'Alho', qty: 15, unit: 'G' },
    ],
    ids,
  );

  // Produtos finais.
  await recipe(
    {
      name: 'Hamburguer da Casa',
      kind: 'PRODUCT',
      description: '160 g de carne, queijo, salada e maionese da casa.',
      yieldQty: 1,
      yieldUnit: 'UN',
      packaging: 'Caixa de hamburguer',
      deliveryPackaging: 'Saco de transporte',
    },
    [
      { ing: 'Carne picada 20% gordura', qty: 160, unit: 'G' },
      { ing: 'Pao de hamburguer', qty: 1, unit: 'UN' },
      { ing: 'Queijo cheddar fatiado', qty: 40, unit: 'G' },
      { ing: 'Alface', qty: 0.1, unit: 'UN' },
      { ing: 'Tomate', qty: 30, unit: 'G' },
      { rec: 'Maionese da casa', qty: 30, unit: 'ML' },
    ],
    ids,
  );

  await recipe(
    {
      name: 'Hamburguer Premium (alcatra)',
      kind: 'PRODUCT',
      description: 'Alcatra limpa na casa — repare no efeito do fator de correcao.',
      yieldQty: 1,
      yieldUnit: 'UN',
      packaging: 'Caixa de hamburguer',
      deliveryPackaging: 'Saco de transporte',
    },
    [
      { ing: 'Alcatra (para limpar)', qty: 180, unit: 'G' },
      { ing: 'Pao de hamburguer', qty: 1, unit: 'UN' },
      { ing: 'Queijo cheddar fatiado', qty: 40, unit: 'G' },
      { ing: 'Tomate', qty: 30, unit: 'G' },
      { rec: 'Maionese da casa', qty: 30, unit: 'ML' },
    ],
    ids,
  );

  await recipe(
    {
      name: 'Porcao de batata frita',
      kind: 'PRODUCT',
      description: 'Porcao de 250 g.',
      yieldQty: 1,
      yieldUnit: 'UN',
      packaging: 'Embalagem de batata',
      deliveryPackaging: 'Saco de transporte',
    },
    [
      { rec: 'Batata frita tempero da casa', qty: 250, unit: 'G' },
      { rec: 'Maionese da casa', qty: 25, unit: 'ML' },
    ],
    ids,
  );

  await recipe(
    {
      name: 'Sanduiche de frango',
      kind: 'PRODUCT',
      yieldQty: 1,
      yieldUnit: 'UN',
      packaging: 'Caixa de hamburguer',
      deliveryPackaging: 'Saco de transporte',
      pricingMode: 'MANUAL',
      // Preco que a casa "ja pratica" — para a aplicacao fazer a autopsia.
      manualPrice: 5.5,
    },
    [
      { ing: 'Peito de frango', qty: 150, unit: 'G' },
      { ing: 'Pao de hamburguer', qty: 1, unit: 'UN' },
      { ing: 'Alface', qty: 0.1, unit: 'UN' },
      { ing: 'Tomate', qty: 30, unit: 'G' },
      { rec: 'Maionese da casa', qty: 30, unit: 'ML' },
    ],
    ids,
  );

  // -------------------------------------------------------------------------
  // Historico de precos: duas cotacoes da carne, para o painel ter o que
  // alertar sobre flutuacao.
  // -------------------------------------------------------------------------
  const carneId = ing('Carne picada 20% gordura');
  await prisma.priceQuote.deleteMany({ where: { ingredientId: carneId } });
  await prisma.priceQuote.createMany({
    data: [
      {
        ingredientId: carneId,
        source: 'MANUAL',
        label: 'Carne picada 5 kg — mes passado',
        price: 11.2,
        qty: 5,
        unit: 'KG',
        capturedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      },
      {
        ingredientId: carneId,
        source: 'MANUAL',
        label: 'Carne picada 5 kg — agora',
        price: 12.5,
        qty: 5,
        unit: 'KG',
      },
    ],
  });

  console.log('Seed concluido.');
  console.log(`  ${ingredients.size} insumos/embalagens`);
  console.log(`  ${ids.size} fichas tecnicas`);
  console.log(`  ${channelSeed.length} canais de venda`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
