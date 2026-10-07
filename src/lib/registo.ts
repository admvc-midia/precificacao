/**
 * Registo de alteracoes: quem mudou o que, e quando.
 *
 * So se escreve aqui — nada na app altera ou apaga uma linha do registo. E
 * `registar` nunca lanca: um problema no registo nao pode estragar a acao que
 * se queria fazer (a encomenda guardada vale mais do que a linha a dizer que
 * foi guardada). Uma falha fica no log do servidor.
 *
 * Fora de `lib/actions/` de proposito: um ficheiro 'use server' tornaria
 * `registar` chamavel do browser, e qualquer pessoa escreveria no registo.
 */

import { prisma } from '@/lib/db';

/** Textos curtos: o registo e para ler de relance, nao para guardar documentos. */
const MAX = 500;

export async function registar(entrada: {
  quem: { id: string; name: string } | null;
  acao: string;
  alvo?: string | null;
  detalhe?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entrada.quem?.id ?? null,
        userName: entrada.quem?.name ?? '(sem sessao)',
        action: entrada.acao.slice(0, 80),
        target: entrada.alvo?.slice(0, MAX) ?? null,
        detail: entrada.detalhe?.slice(0, MAX) ?? null,
      },
    });
  } catch (err) {
    console.warn('[registo] nao consegui registar', entrada.acao, err);
  }
}

/** Campos que nunca vao para o registo, nem resumidos. */
const FORA = /password|senha|token|secret|foto|mini|ficheiro|Submitted$/i;
/** Campos que identificam o alvo, por ordem de preferencia. */
const ALVO = ['name', 'title', 'businessName', 'id', 'orderId', 'ingredientId', 'recipeId', 'listId'];

/** O que foi mexido, a partir do formulario: o nome se houver, senao o id. */
export function alvoDoFormulario(form: FormData): string | null {
  for (const k of ALVO) {
    const v = form.get(k);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Os campos do formulario, resumidos: "status=DELIVERED; paymentMethod=MBWAY".
 * Sem segredos nem ficheiros, sem os ids (ja estao no alvo), e cortado.
 */
export function resumoDoFormulario(form: FormData): string | null {
  const partes: string[] = [];
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string' || FORA.test(k) || k.startsWith('$ACTION') || ALVO.includes(k)) continue;
    const t = v.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    partes.push(`${k}=${t.length > 40 ? `${t.slice(0, 40)}…` : t}`);
  }
  return partes.length > 0 ? partes.join('; ').slice(0, MAX) : null;
}

/** "IVA 13% → 6%" para os campos que mudaram; vazio se nada mudou. */
export function diferencas(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  rotulos: Record<string, string> = {},
): string {
  const fmt = (v: unknown) =>
    v === null || v === undefined || v === ''
      ? '—'
      : v instanceof Date
        ? v.toISOString().slice(0, 16).replace('T', ' ')
        : // Decimal do Prisma, numeros e texto: o String() de cada um serve.
          String(v);
  return Object.keys(depois)
    .filter((k) => fmt(antes[k]) !== fmt(depois[k]))
    .map((k) => `${rotulos[k] ?? k}: ${fmt(antes[k])} → ${fmt(depois[k])}`)
    .join('; ');
}
