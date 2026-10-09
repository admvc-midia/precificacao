/**
 * O que o cardapio publico mostra, e o que o ecra do dono precisa.
 *
 * ---------------------------------------------------------------------------
 * A PAGINA PUBLICA NAO VE CUSTOS
 * ---------------------------------------------------------------------------
 * `getCardapioPublico` devolve so o que o cliente pode ler: nomes, textos,
 * precos com IVA, promocoes e alergenios. Os custos sao usados (alergenios
 * precisam da composicao) mas nunca saem desta funcao: o objeto devolvido e
 * montado campo a campo, nunca com `...linha`.
 *
 * Fica em cache (etiqueta `cardapio`) para cada visita vinda do Instagram nao
 * ir a base. As actions que mudam o cardapio, as promocoes, as fichas ou as
 * configuracoes chamam `updateTag(TAG_CARDAPIO)`.
 */

import { unstable_cache } from 'next/cache';

import { diaEmLisboa } from '@/lib/datas';
import { garantiasDe } from './capa';
import { caminhoDaFoto, fotoDaSecaoSrc, fotoPublicaSrc } from './fotos';
import { prisma } from '@/lib/db';
import { buildCostContext, num, toGlobalSettings } from '@/lib/mappers';
import { currencyOf, type CurrencyConfig } from '@/lib/money';
import { ALLERGEN_LABEL, collectAllergens, type Allergen } from '@/lib/pricing/allergens';
import type { PromocaoInput } from '@/lib/pricing/cardapio';
import { flattenRecipe } from '@/lib/pricing/cost';
import { grossOf } from '@/lib/pricing/encomendas';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes, getPricingData } from '@/lib/queries';

export const TAG_CARDAPIO = 'cardapio';

export { caminhoDaFoto, fotoDaSecaoSrc, fotoPublicaSrc } from './fotos';
export { garantiasDe, GARANTIAS_DE_ORIGEM } from './capa';

/** "AAAA-MM-DD" de uma coluna `@db.Date` (meia-noite UTC). */
export function diaDaColuna(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type LayoutDaSecao = 'LIST' | 'CARDS' | 'TEXT' | 'GALLERY';

export interface ItemPublico {
  id: string;
  kind: 'PRODUCT' | 'COMBO';
  nome: string;
  descricao: string | null;
  unidade: string | null;
  /** Com IVA, como o cliente paga. */
  preco: number;
  sobConsulta: boolean;
  esgotado: boolean;
  foto: string | null;
  fotoMini: string | null;
  /** Combo: "6 × Brigadeiro". */
  leva: string[];
  alergenios: { presentes: string[]; completo: boolean };
  /** "Mais pedido" / "Novidade", escolhido pelo dono. */
  destaque: 'BESTSELLER' | 'NEW' | null;
  /** "Combina com": ids de itens visiveis (os outros saem ao montar). */
  combinaCom: string[];
}

export interface SecaoPublica {
  id: string;
  nome: string;
  layout: LayoutDaSecao;
  descricao: string | null;
  tituloDosItens: string | null;
  rodape: string | null;
  destaque: string | null;
  corpo: string | null;
  /** Foto de capa da secao. */
  foto: string | null;
  fotoMini: string | null;
  itens: ItemPublico[];
}

export interface CardapioPublico {
  aberto: boolean;
  nome: string;
  intro: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  /** As garantias da capa ("100% artesanal"), no maximo 3. */
  garantias: string[];
  currency: CurrencyConfig;
  secoes: SecaoPublica[];
  /** Com os valores ja com IVA. As terminadas e as desligadas nao vem. */
  promocoes: PromocaoInput[];
}

async function montarCardapioPublico(): Promise<CardapioPublico> {
  const settingsRow = await prisma.settings.findUnique({ where: { id: 'default' } });
  const currency = settingsRow ? currencyOf(settingsRow) : { currency: 'EUR', locale: 'pt-PT' };
  const base = {
    nome: settingsRow?.businessName || 'Amo Brigs',
    intro: settingsRow?.menuIntro ?? null,
    garantias: garantiasDe(settingsRow?.menuHighlights),
    whatsapp: settingsRow?.whatsappNumber ?? null,
    instagram: settingsRow?.instagramHandle ?? null,
    facebook: settingsRow?.facebookHandle ?? null,
    currency,
  };
  if (!settingsRow?.menuPublished) {
    return { ...base, aberto: false, secoes: [], promocoes: [] };
  }
  const settings = toGlobalSettings(settingsRow);
  const bruto = (v: number) => grossOf(v, settings);

  const fotoSel = { select: { name: true, photoPath: true, photoThumbPath: true } } as const;
  const [secoes, soltos, promos, data] = await Promise.all([
    prisma.menuSection.findMany({
      where: { published: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: { published: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: { recipe: fotoSel, components: { include: { recipe: fotoSel }, orderBy: { id: 'asc' } } },
        },
      },
    }),
    prisma.menuItem.findMany({
      where: { published: true, sectionId: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { recipe: fotoSel, components: { include: { recipe: fotoSel }, orderBy: { id: 'asc' } } },
    }),
    prisma.promotion.findMany({ where: { active: true }, include: { items: { select: { menuItemId: true } } } }),
    getPricingData(),
  ]);

  // Alergenios: a composicao achatada de cada ficha, como na ficha impressa.
  const ctx = buildCostContext(data.ingredientRows, data.recipeRows);
  const porId = new Map(data.ingredientRows.map((i) => [i.id, i]));
  const fontesDe = (recipeId: string) => {
    try {
      return flattenRecipe(recipeId, 1, ctx).map((l) => {
        const ing = porId.get(l.ingredientId);
        return {
          ingredientId: l.ingredientId,
          name: l.name,
          category: l.category,
          allergens: (ing?.allergens ?? []) as Allergen[],
          reviewed: ing?.allergensReviewed ?? false,
        };
      });
    } catch {
      // Ficha com erro: nao se sabe o que leva, por isso nao se diz "nao tem".
      return [{ ingredientId: '?', name: '?', category: 'FOOD' as const, allergens: [], reviewed: false }];
    }
  };

  type Linha = (typeof soltos)[number];
  const item = (i: Linha): ItemPublico => {
    const recipeIds = i.recipeId ? [i.recipeId] : i.components.map((c) => c.recipeId);
    const rel = collectAllergens(recipeIds.flatMap(fontesDe));
    const foto = caminhoDaFoto(i);
    return {
      id: i.id,
      kind: i.kind,
      nome: i.name || i.recipe?.name || 'Sem nome',
      descricao: i.description,
      unidade: i.unitLabel,
      preco: bruto(num(i.price)),
      sobConsulta: i.priceOnRequest,
      esgotado: i.soldOut,
      foto: fotoPublicaSrc(i.id, foto?.photoPath),
      fotoMini: fotoPublicaSrc(i.id, foto?.photoThumbPath ?? foto?.photoPath, 'mini'),
      leva: i.components.map((c) => `${formatQty(num(c.qty))} × ${c.recipe.name}`),
      destaque: i.highlight,
      combinaCom: i.pairsWith,
      alergenios: {
        presentes: rel.present.map((a) => ALLERGEN_LABEL[a]),
        completo: rel.complete && recipeIds.length > 0,
      },
    };
  };

  const secoesPublicas: SecaoPublica[] = secoes.map((s) => ({
    id: s.id,
    nome: s.name,
    layout: s.layout,
    descricao: s.description,
    tituloDosItens: s.itemsTitle,
    rodape: s.footnote,
    destaque: s.highlight,
    corpo: s.body,
    foto: fotoDaSecaoSrc(s.id, s.photoPath),
    fotoMini: fotoDaSecaoSrc(s.id, s.photoThumbPath ?? s.photoPath, 'mini'),
    itens: s.layout === 'TEXT' ? [] : s.items.map(item),
  }));
  if (soltos.length) {
    secoesPublicas.push({
      id: 'outros',
      nome: 'Outros',
      layout: 'LIST',
      descricao: null,
      tituloDosItens: null,
      rodape: null,
      destaque: null,
      corpo: null,
      foto: null,
      fotoMini: null,
      itens: soltos.map(item),
    });
  }

  const visiveis = new Set(secoesPublicas.flatMap((s) => s.itens.map((i) => i.id)));
  // "Combina com" so com itens que o cliente consegue ver e juntar.
  for (const s of secoesPublicas) {
    for (const it of s.itens) it.combinaCom = it.combinaCom.filter((id) => id !== it.id && visiveis.has(id)).slice(0, 3);
  }
  const hoje = diaEmLisboa(new Date());
  const promocoes = promos
    .filter((p) => !p.endsAt || diaDaColuna(p.endsAt) >= hoje)
    .map((p) => promocaoInput(p, bruto))
    .map((p) => ({ ...p, menuItemIds: p.menuItemIds.filter((id) => visiveis.has(id)) }))
    .filter((p) => p.menuItemIds.length > 0);

  return { ...base, aberto: true, secoes: secoesPublicas, promocoes };
}

/** Uma linha de `Promotion` como as contas a querem; `conv` passa valores a IVA incluido. */
export function promocaoInput(
  p: {
    id: string;
    name: string;
    kind: PromocaoInput['kind'];
    value: unknown;
    buyQty: number | null;
    payQty: number | null;
    minQty: unknown;
    startsAt: Date;
    endsAt: Date | null;
    active: boolean;
    items: Array<{ menuItemId: string }>;
  },
  conv: (v: number) => number = (v) => v,
): PromocaoInput {
  const value = p.value == null ? null : num(p.value);
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    // A percentagem nao muda com o IVA; os valores em dinheiro sim.
    value: value == null ? null : p.kind === 'PERCENT' ? value : conv(value),
    buyQty: p.buyQty,
    payQty: p.payQty,
    minQty: p.minQty == null ? null : num(p.minQty),
    startsAt: diaDaColuna(p.startsAt),
    endsAt: p.endsAt ? diaDaColuna(p.endsAt) : null,
    active: p.active,
    menuItemIds: p.items.map((i) => i.menuItemId),
  };
}

function formatQty(q: number): string {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(q);
}

export const getCardapioPublico = unstable_cache(montarCardapioPublico, ['cardapio-publico'], {
  tags: [TAG_CARDAPIO],
  revalidate: 300,
});

// ---------------------------------------------------------------------------
// Ecra do dono
// ---------------------------------------------------------------------------

export async function getCardapioDoDono() {
  const itemInclude = {
    recipe: { select: { id: true, name: true, photoPath: true, photoThumbPath: true } },
    components: {
      include: { recipe: { select: { id: true, name: true, photoPath: true, photoThumbPath: true } } },
      orderBy: { id: 'asc' as const },
    },
    promotions: { select: { promotionId: true } },
  };
  const [secoes, itens] = await Promise.all([
    prisma.menuSection.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    prisma.menuItem.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: itemInclude,
    }),
  ]);
  return { secoes, itens };
}

/**
 * O preco de tabela de cada produto final (canal de referencia), como na
 * nova encomenda. `null` quando nao ha custo ou o preco nao e viavel.
 */
export async function precosDeTabela(): Promise<Map<string, number | null>> {
  const { recipes, settings, channels } = await getCostedRecipes();
  const ref = referenceChannel(channels);
  return new Map(
    recipes
      .filter((r) => r.kind === 'PRODUCT')
      .map((r) => {
        const p = r.error ? null : priceForRecipe(r, ref, settings);
        return [r.id, p?.feasible && p.price > 0 ? p.price : null];
      }),
  );
}
