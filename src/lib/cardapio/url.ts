/**
 * O endereco publico do cardapio, a partir dos cabecalhos do pedido: na
 * Vercel o `x-forwarded-host` traz o dominio verdadeiro.
 */
export function urlDoCardapio(h: Headers): string {
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/cardapio`;
}
