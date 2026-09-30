/**
 * Tipos e auxiliares partilhados pelas Server Actions.
 *
 * Vive fora dos ficheiros 'use server' de proposito: um modulo marcado com
 * 'use server' so pode exportar funcoes async — tudo o resto (tipos,
 * auxiliares sincronos) tem de ficar aqui, ou o build falha.
 */

import { z } from 'zod';

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
