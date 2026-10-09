/** As garantias da capa do cardapio publico. Sem base de dados. */

/** As garantias que vem com a app, quando o dono nao escreveu outras. */
export const GARANTIAS_DE_ORIGEM = ['100% artesanal', 'Encomende com 2 dias', 'Entregas ao fim de semana'];

/** Uma por linha, sem vazias, no maximo 3. */
export function garantiasDe(texto: string | null | undefined): string[] {
  if (texto == null) return GARANTIAS_DE_ORIGEM;
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
}
