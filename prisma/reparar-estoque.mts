/**
 * Duas reparacoes no estoque, ambas herdadas de defeitos ja corrigidos.
 *
 * ---------------------------------------------------------------------------
 * 1. CUSTO MEDIO MIL VEZES MAIS BAIXO
 * ---------------------------------------------------------------------------
 * Enquanto `0.200` era lido como 200, alguns insumos nasceram com a embalagem
 * mil vezes maior. A embalagem ja foi corrigida a mao, e com ela o preco de
 * compra — mas o `avgCostBase`, que e o custo do que esta no armazem, foi
 * calculado no momento da criacao e nao se recalcula quando o preco muda.
 * Por desenho: o custo do que ja esta em casa nao sobe porque o fornecedor
 * subiu o preco. So que aqui o valor nasceu errado.
 *
 * O criterio e a **ordem de grandeza**: so mexe quando o custo esperado e pelo
 * menos cem vezes o guardado. Nenhum preco de mercearia varia cem vezes, por
 * isso nao ha como confundir isto com o preco a mudar — e uma diferenca de
 * 20%, que e preco a variar, fica de fora.
 *
 * Nao se compara com mil exatos porque a coluna guarda seis casas decimais:
 * um custo de 0,0000045 por grama fica arredondado a 0,000005, e a razao que
 * daria mil passa a dar novecentos. O arredondamento nao muda a ordem de
 * grandeza, que e o que interessa.
 *
 * ---------------------------------------------------------------------------
 * 2. SALDO SEM NADA NO LIVRO QUE O EXPLIQUE
 * ---------------------------------------------------------------------------
 * Criar um insumo com estoque gravava o saldo mas nao escrevia movimento
 * nenhum, enquanto editar escrevia. O saldo e suposto ser a soma dos
 * movimentos; onde isso nao se cumpre, nao ha como reconstruir o estoque a
 * partir do livro quando algo nao bater.
 *
 * Lanca uma entrada de inventario pela **diferenca** entre o saldo e o que o
 * livro ja explica, e nao pelo saldo inteiro — senao o acucar, que ja tem um
 * ajuste registado, ficava contado duas vezes.
 *
 * Nenhuma das duas mexe em saldos. A primeira so toca no custo, a segunda so
 * acrescenta linhas ao livro.
 *
 *   npx tsx prisma/reparar-estoque.mts           ensaio
 *   npx tsx prisma/reparar-estoque.mts --apply   repara
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--apply');

/** A partir de quantas vezes se assume o defeito do decimal, e nao o preco. */
const ORDEM_DE_GRANDEZA = 100;

const n = (v: unknown) => Number(v);
const fmt = (v: number, c = 5) => v.toFixed(c).replace('.', ',');

async function main() {
  const insumos = await prisma.ingredient.findMany({
    orderBy: { name: 'asc' },
    include: {
      offers: { where: { inUse: true } },
      movements: { select: { qtyBase: true } },
    },
  });

  // ------------------------------------------------ 1. custo medio
  const custos: Array<{ id: string; nome: string; de: number; para: number }> = [];

  for (const i of insumos) {
    const oferta = i.offers[0];
    if (!oferta) continue;

    const atual = n(i.avgCostBase);
    if (atual <= 0) continue;

    // O custo por unidade base que a oferta em uso implica.
    const porBase =
      n(oferta.purchaseQty) > 0
        ? n(oferta.purchasePrice) / baseDe(n(oferta.purchaseQty), oferta.purchaseUnit)
        : 0;
    if (porBase <= 0) continue;

    if (porBase / atual >= ORDEM_DE_GRANDEZA) {
      custos.push({ id: i.id, nome: i.name, de: atual, para: porBase });
    }
  }

  // ------------------------------------------------ 2. livro incompleto
  const aberturas: Array<{ id: string; nome: string; qty: number; custo: number }> = [];

  for (const i of insumos) {
    const saldo = n(i.stockBase);
    const noLivro = i.movements.reduce((acc, m) => acc + n(m.qtyBase), 0);
    const falta = saldo - noLivro;
    if (Math.abs(falta) < 1e-9) continue;

    // O custo ja corrigido acima, se for o caso.
    const corrigido = custos.find((c) => c.id === i.id);
    aberturas.push({
      id: i.id,
      nome: i.name,
      qty: falta,
      custo: corrigido ? corrigido.para : n(i.avgCostBase),
    });
  }

  console.log(aplicar ? 'A REPARAR' : 'ENSAIO — nada sera alterado');
  console.log('\n1. Custo medio mil vezes mais baixo');
  console.log('-'.repeat(64));
  if (custos.length === 0) console.log('  nada a corrigir');
  for (const c of custos) {
    console.log(
      `  ${c.nome.padEnd(24)} ${fmt(c.de)} -> ${fmt(c.para)} por unidade base`,
    );
  }

  console.log('\n2. Entrada inicial em falta no livro');
  console.log('-'.repeat(64));
  if (aberturas.length === 0) console.log('  nada a lancar');
  for (const a of aberturas) {
    console.log(
      `  ${a.nome.padEnd(24)} ${String(a.qty).padStart(8)} na unidade base` +
        `  a ${fmt(a.custo)}`,
    );
  }

  if (!aplicar) {
    console.log('\nPara reparar: npx tsx prisma/reparar-estoque.mts --apply');
    return;
  }

  for (const c of custos) {
    await prisma.ingredient.update({
      where: { id: c.id },
      data: { avgCostBase: c.para },
    });
  }

  for (const a of aberturas) {
    await prisma.stockMovement.create({
      data: {
        ingredientId: a.id,
        kind: 'INVENTORY',
        qtyBase: a.qty,
        unitCost: a.custo,
        value: a.qty * a.custo,
        note: 'Estoque inicial, lancado ao cadastrar o insumo',
      },
    });
  }

  console.log(
    `\n${custos.length} custo(s) corrigido(s), ${aberturas.length} entrada(s) lancada(s).`,
  );

  // Prova de que os saldos nao mudaram e que o livro passou a fechar.
  const depois = await prisma.ingredient.findMany({
    include: { movements: { select: { qtyBase: true } } },
  });
  const desalinhados = depois.filter((i) => {
    const soma = i.movements.reduce((acc, m) => acc + n(m.qtyBase), 0);
    return Math.abs(soma - n(i.stockBase)) > 1e-9;
  });
  console.log(
    desalinhados.length === 0
      ? 'Todos os saldos passam a bater com a soma do livro.'
      : `AINDA DESALINHADOS: ${desalinhados.map((i) => i.name).join(', ')}`,
  );
}

/** Copia minima de `toBase`, para o script nao depender do alias `@/`. */
function baseDe(qty: number, unit: string): number {
  const fator: Record<string, number> = { KG: 1000, G: 1, L: 1000, ML: 1, UN: 1 };
  return qty * (fator[unit] ?? 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
