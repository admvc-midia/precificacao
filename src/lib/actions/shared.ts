/**
 * Tipos e auxiliares partilhados pelas Server Actions.
 *
 * Vive fora dos ficheiros 'use server' de proposito: um modulo marcado com
 * 'use server' so pode exportar funcoes async — tudo o resto (tipos,
 * auxiliares sincronos) tem de ficar aqui, ou o build falha.
 */

import { z } from 'zod';

import { parseDecimal, parseQty } from '@/lib/money';
import type { PurchaseUnit } from '@/lib/units';

export interface ActionState {
  ok: boolean;
  message?: string;
  /**
   * Nomes ja existentes parecidos com o que se tentou gravar. Nao e um erro:
   * e a aplicacao a perguntar antes de deixar criar um duplicado por gralha.
   */
  similar?: string[];
}

export const PURCHASE_UNIT = z.enum(['KG', 'G', 'L', 'ML', 'UN']);

/** Os catorze do Anexo II do Reg. (UE) 1169/2011. Lista fechada por lei. */
export const ALLERGEN = z.enum([
  'GLUTEN',
  'CRUSTACEOS',
  'OVOS',
  'PEIXES',
  'AMENDOINS',
  'SOJA',
  'LEITE',
  'FRUTOS_CASCA_RIJA',
  'AIPO',
  'MOSTARDA',
  'SESAMO',
  'SULFITOS',
  'TREMOCO',
  'MOLUSCOS',
]);
export const CATEGORY = z.enum(['FOOD', 'PACKAGING']);
export const QUOTE_SOURCE = z.enum([
  'MANUAL',
  'CSV',
  'CONTINENTE',
  'PINGO_DOCE',
  'AUCHAN',
  'OTHER',
]);
export const VAT_MODE = z.enum(['INCLUDED', 'ADDED']);
export const ROUNDING = z.enum([
  'NONE',
  'NEAREST_05',
  'NEAREST_10',
  'ENDING_90',
  'ENDING_95',
]);
export const CHANNEL_KIND = z.enum(['COUNTER', 'OWN_DELIVERY', 'PLATFORM']);
export const RECIPE_KIND = z.enum(['BASE', 'PRODUCT']);
export const BASE_UNIT = z.enum(['G', 'ML', 'UN']);
export const PRICING_MODE = z.enum(['TARGET_CMV', 'TARGET_MARGIN', 'MANUAL']);

/** Traduz o erro para algo que o dono da lanchonete consiga agir. */
export function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => i.message).join(' ');
  }
  if (err instanceof Error) {
    if (err.message.includes('Unique constraint')) {
      return 'Ja existe um registo com esse nome.';
    }
    if (err.message.includes('Foreign key constraint')) {
      return 'Este registo esta ligado a outros e nao pode ser removido assim.';
    }
    return err.message;
  }
  return 'Erro inesperado.';
}

export interface DadosDePreco {
  supplierId: string | null;
  purchasePrice: number;
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  sku: string | null;
  notes: string | null;
}

/**
 * Le e valida os campos de preco de um formulario.
 *
 * Vive aqui e nao em `offers.ts`: num ficheiro 'use server' cada export e uma
 * action chamavel do browser, e isto e um auxiliar das actions, nao uma delas.
 */
export function lerPreco(form: FormData): DadosDePreco {
  const purchasePrice = parseDecimal(String(form.get('purchasePrice') ?? ''));
  const purchaseQty = parseQty(String(form.get('purchaseQty') ?? ''));
  const purchaseUnit = PURCHASE_UNIT.parse(
    String(form.get('purchaseUnit') ?? 'KG'),
  ) as PurchaseUnit;

  if (purchasePrice <= 0) throw new Error('O preco tem de ser maior que zero.');
  if (purchaseQty <= 0) {
    throw new Error('O tamanho da embalagem tem de ser maior que zero.');
  }

  return {
    supplierId: String(form.get('supplierId') ?? '') || null,
    purchasePrice,
    purchaseQty,
    purchaseUnit,
    sku: String(form.get('sku') ?? '').trim() || null,
    notes: String(form.get('notes') ?? '').trim() || null,
  };
}
