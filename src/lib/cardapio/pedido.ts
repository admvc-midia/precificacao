/**
 * A ultima escolha feita no cardapio, guardada so no telemovel de quem a fez
 * (`localStorage`), para "Repetir a ultima escolha" na visita seguinte. Sem
 * nome, telefone nem conta: so ids de itens e quantidades.
 */

export const CHAVE_ULTIMA = 'amobrigs-ultima-escolha';

export interface UltimaEscolha {
  /** id do item → quantidade. */
  itens: Record<string, number>;
  /** "AAAA-MM-DD", para dizer "da ultima vez (12/10)". */
  dia: string;
}

/** Le o que esta guardado; qualquer coisa estranha conta como nada. */
export function lerUltima(texto: string | null | undefined): UltimaEscolha | null {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto) as unknown;
    if (!v || typeof v !== 'object') return null;
    const { itens, dia } = v as { itens?: unknown; dia?: unknown };
    if (!itens || typeof itens !== 'object' || typeof dia !== 'string') return null;
    const limpos = Object.fromEntries(
      Object.entries(itens as Record<string, unknown>).filter(
        ([id, q]) => /^[A-Za-z0-9_-]{1,40}$/.test(id) && typeof q === 'number' && Number.isInteger(q) && q > 0 && q < 1000,
      ),
    ) as Record<string, number>;
    return Object.keys(limpos).length ? { itens: limpos, dia } : null;
  } catch {
    return null;
  }
}

export function guardarUltima(qtd: Record<string, number>, dia: string): string {
  return JSON.stringify({ itens: Object.fromEntries(Object.entries(qtd).filter(([, q]) => q > 0)), dia });
}

/**
 * O que da ultima escolha ainda se pode encomendar hoje (existe, nao esta
 * esgotado, nao e "sob consulta"), e quantos itens ficaram de fora.
 */
export function repetivel(
  ultima: UltimaEscolha,
  disponivel: (id: string) => boolean,
): { qtd: Record<string, number>; foraDe: number } {
  const qtd: Record<string, number> = {};
  let foraDe = 0;
  for (const [id, q] of Object.entries(ultima.itens)) {
    if (disponivel(id)) qtd[id] = q;
    else foraDe++;
  }
  return { qtd, foraDe };
}
