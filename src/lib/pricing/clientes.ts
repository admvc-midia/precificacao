/**
 * Clientes e pos-venda: as regras, sem base de dados.
 *
 * O pos-venda so escreve a quem deu consentimento — isso e decidido em quem
 * chama (actions e consultas), mas as contas de datas, a mensagem e as
 * estatisticas vivem aqui para se poderem testar sozinhas.
 */

import { daysBetween, normalizePhone } from './encomendas';

export type CustomerSource =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'WHATSAPP'
  | 'REFERRAL'
  | 'WALK_IN'
  | 'EVENT'
  | 'OTHER';
export type ContactVia = 'PHONE' | 'WHATSAPP' | 'IN_PERSON';

export const SOURCE_LABEL: Record<CustomerSource, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Indicação',
  WALK_IN: 'Passou à porta',
  EVENT: 'Evento ou feira',
  OTHER: 'Outro',
};

export const VIA_LABEL: Record<ContactVia, string> = {
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  IN_PERSON: 'Pessoalmente',
};

/** Sem encomendar ha mais do que isto, o cliente aparece como "a esfriar". */
export const DIAS_SEM_ENCOMENDAR = 60;

/** Com quantos dias de antecedencia o aniversario entra nos lembretes. */
export const DIAS_ANTES_ANIVERSARIO = 7;

// ---------------------------------------------------------------------------
// A mensagem do pos-venda
// ---------------------------------------------------------------------------

/**
 * A mensagem que vem com a app. Ajusta-se nas Configuracoes; as chavetas
 * trocam-se pelos dados da encomenda.
 */
export const MENSAGEM_POS_VENDA =
  'Olá {nome}! Aqui é da {loja}. 😊\n' +
  'Queríamos saber se gostou de {produtos} ({dia}).\n' +
  'De 1 a 5, que nota nos dá? E se houver alguma coisa a melhorar, diga-nos — ajuda-nos muito.\n' +
  'Obrigada pela preferência!';

/** As chavetas que a mensagem aceita, para a ajuda das Configuracoes. */
export const CHAVES_MENSAGEM = ['{nome}', '{loja}', '{produtos}', '{dia}'] as const;

/**
 * Troca as chavetas pelos valores. Uma chave desconhecida fica como esta —
 * melhor ver "{nme}" na mensagem do que ela sair com um buraco.
 */
export function fillMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (inteiro, chave: string) =>
    chave in vars ? vars[chave] : inteiro,
  );
}

/** "o Bolo de Brigadeiro", "o Bolo e os 20 Brigadeiros" — lista legivel. */
export function listProducts(lines: Array<{ name: string; qty: number }>): string {
  const itens = lines.map((l) => (l.qty > 1 ? `${formatQty(l.qty)} ${l.name}` : l.name));
  if (itens.length <= 1) return itens[0] ?? 'a encomenda';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/**
 * O link que abre a conversa no WhatsApp, com a mensagem ja escrita se houver.
 * Numeros portugueses de 9 digitos levam o 351; os outros vao como estao.
 */
export function linkWhatsApp(telefone: string, texto?: string): string {
  const d = normalizePhone(telefone);
  const numero = d.length === 9 ? `351${d}` : d;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// ---------------------------------------------------------------------------
// Redes sociais
// ---------------------------------------------------------------------------

export type Rede = 'instagram' | 'facebook' | 'tiktok';

export const REDE_LABEL: Record<Rede, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

const DOMINIOS: Record<Rede, string[]> = {
  instagram: ['instagram.com', 'instagr.am'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
};

/** Caminhos do Instagram que nao sao um perfil. */
const INSTA_NAO_PERFIL = ['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct'];
/** Caminhos do Facebook que nao sao um perfil nem uma pagina. */
const FB_NAO_PERFIL = ['groups', 'events', 'share', 'sharer', 'sharer.php', 'story.php', 'watch', 'photo', 'photo.php', 'permalink.php', 'marketplace'];

/**
 * O que se escreveu no campo da rede, arrumado para guardar: "@Ana.Doces",
 * "ana.doces" e "https://www.instagram.com/ana.doces/?hl=pt" dao todos
 * "ana.doces". Um perfil do Facebook sem nome de utilizador fica
 * "profile.php?id=123". Vazio da `null`; o que nao se percebe rebenta, com
 * a razao — melhor do que guardar um link que nao abre.
 */
export function lerRede(rede: Rede, texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const nome = REDE_LABEL[rede];

  let valor: string;
  const pareceLink = /^https?:\/\//i.test(t) || /^(www\.|m\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(t);
  if (pareceLink) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    } catch {
      throw new Error(`Nao percebi o link do ${nome}.`);
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
    if (!DOMINIOS[rede].includes(host)) throw new Error(`Esse link nao e do ${nome}.`);
    const partes = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));

    if (rede === 'instagram') {
      if (partes[0] === 'stories' && partes[1]) valor = partes[1];
      else if (!partes[0] || INSTA_NAO_PERFIL.includes(partes[0].toLowerCase())) {
        throw new Error('Esse link e de uma publicacao. Cole o link do perfil (instagram.com/nome).');
      } else valor = partes[0];
    } else if (rede === 'tiktok') {
      if (!partes[0]?.startsWith('@')) {
        throw new Error('Esse link nao e de um perfil. Cole o link do perfil (tiktok.com/@nome).');
      }
      valor = partes[0];
    } else {
      const id = url.searchParams.get('id');
      if (partes[0] === 'profile.php' && id && /^\d+$/.test(id)) return `profile.php?id=${id}`;
      // facebook.com/people/Nome-Apelido/1000123
      if (partes[0] === 'people' && partes[2] && /^\d+$/.test(partes[2])) return `profile.php?id=${partes[2]}`;
      if (!partes[0] || FB_NAO_PERFIL.includes(partes[0].toLowerCase())) {
        throw new Error('Esse link nao e de um perfil nem de uma pagina. Cole o link do perfil (facebook.com/nome).');
      }
      valor = partes[0];
    }
  } else {
    valor = t;
  }

  // Os nomes de utilizador destas redes nao distinguem maiusculas.
  const h = valor.replace(/^@+/, '').toLowerCase();
  const valido =
    rede === 'instagram'
      ? /^[a-z0-9._]{1,30}$/.test(h)
      : rede === 'tiktok'
        ? /^[a-z0-9._]{2,24}$/.test(h)
        : /^[a-z0-9.]{5,50}$/.test(h);
  if (!valido) {
    throw new Error(`"${t.slice(0, 40)}" nao parece um nome do ${nome}. Escreva o nome de utilizador (@nome) ou cole o link do perfil.`);
  }
  return h;
}

/** O link do perfil, a partir do que esta guardado. */
export function linkRede(rede: Rede, valor: string): string {
  if (rede === 'instagram') return `https://www.instagram.com/${valor}/`;
  if (rede === 'tiktok') return `https://www.tiktok.com/@${valor}`;
  return `https://www.facebook.com/${valor}`;
}

/** Como se mostra: "@ana.doces"; um perfil do Facebook sem nome, "perfil". */
export function mostrarRede(rede: Rede, valor: string): string {
  if (rede === 'facebook') return valor.startsWith('profile.php') ? 'perfil' : valor;
  return `@${valor}`;
}

/** Primeiro nome, para a mensagem nao comecar por "Ola Maria da Conceicao Silva". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Quando perguntar: `days` dias depois da entrega. */
export function followUpDate(deliveredAt: Date, days: number): Date {
  return new Date(deliveredAt.getTime() + days * 86_400_000);
}

/** Dia seguinte, a mesma hora — "nao atendeu, tentar amanha". */
export function nextAttempt(now: Date): Date {
  return new Date(now.getTime() + 86_400_000);
}

/** Um dia e mes validos (29 de fevereiro conta: ha anos em que existe). */
export function validBirthday(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= max;
}

/**
 * Quantos dias faltam para o proximo aniversario (0 = hoje). `today` na
 * convencao das datas da app (relogio de Lisboa como UTC).
 *
 * Quem faz anos a 29 de fevereiro festeja a 28 nos anos comuns.
 */
export function daysUntilBirthday(day: number, month: number, today: Date): number {
  const ano = today.getUTCFullYear();
  const naquele = (a: number) => {
    const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
    const d = month === 2 && day === 29 && !bissexto ? 28 : day;
    return new Date(Date.UTC(a, month - 1, d));
  };
  const este = naquele(ano);
  const dias = daysBetween(today, este);
  return dias >= 0 ? dias : daysBetween(today, naquele(ano + 1));
}

// ---------------------------------------------------------------------------
// O cliente em numeros
// ---------------------------------------------------------------------------

export interface CustomerOrderSummary {
  status: string;
  dueAt: Date;
  deliveredAt: Date | null;
  /** Total com IVA, como o cliente pagou. */
  gross: number;
  rating: number | null;
}

export interface CustomerStats {
  /** Encomendas entregues. */
  orders: number;
  spent: number;
  averageTicket: number;
  /** Ultima entrega, ou nulo se ainda nao recebeu nenhuma. */
  lastOrder: Date | null;
  averageRating: number | null;
  ratings: number;
}

/** So as entregues contam: uma cancelada nao e dinheiro nem e cliente fiel. */
export function customerStats(orders: CustomerOrderSummary[]): CustomerStats {
  const entregues = orders.filter((o) => o.status === 'DELIVERED');
  const spent = entregues.reduce((a, o) => a + o.gross, 0);
  const notas = entregues.map((o) => o.rating).filter((r): r is number => r !== null);
  const ultima = entregues
    .map((o) => o.deliveredAt ?? o.dueAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    orders: entregues.length,
    spent,
    averageTicket: entregues.length > 0 ? spent / entregues.length : 0,
    lastOrder: ultima ?? null,
    averageRating: notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    ratings: notas.length,
  };
}

/** Media de notas, ou nulo. Nao inventa um 0 para quem nao foi avaliado. */
export function average(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Nota media de cada produto.
 *
 * Vale a nota dada ao produto. Sem ela, e se a encomenda so tinha esse
 * produto, vale a nota geral — e a mesma coisa dita de outra forma. Numa
 * encomenda com varios produtos a nota geral nao se reparte: nao se sabe
 * qual deles a mereceu.
 */
export function productRatings(
  lines: Array<{
    recipeId: string;
    rating: number | null;
    orderRating: number | null;
    linesInOrder: number;
  }>,
): Map<string, { average: number; count: number }> {
  const soma = new Map<string, { total: number; count: number }>();
  for (const l of lines) {
    const nota = l.rating ?? (l.linesInOrder === 1 ? l.orderRating : null);
    if (nota === null) continue;
    const acc = soma.get(l.recipeId) ?? { total: 0, count: 0 };
    acc.total += nota;
    acc.count += 1;
    soma.set(l.recipeId, acc);
  }
  return new Map(
    [...soma].map(([id, { total, count }]) => [id, { average: total / count, count }]),
  );
}

/** Le uma nota de 1 a 5 de um formulario. Vazio e nulo; fora disso e erro. */
export function parseRating(raw: string | undefined | null): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error('A nota tem de ser de 1 a 5.');
  }
  return n;
}

/** "4,6 ★" — uma casa, com virgula. */
export function formatRating(r: number | null): string {
  return r === null ? '—' : `${r.toFixed(1).replace('.', ',')} ★`;
}
