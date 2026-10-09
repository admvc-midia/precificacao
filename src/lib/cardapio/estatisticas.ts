/**
 * Quantas pessoas abrem o cardapio publico e quantas carregam em
 * "Encomendar", por dia e por origem.
 *
 * ---------------------------------------------------------------------------
 * SEM COOKIES E SEM DADOS DA PESSOA
 * ---------------------------------------------------------------------------
 * So se guardam contadores (`MenuStat`: dia, evento, origem, quantos). Nem IP,
 * nem identificador, nem cookie — por isso nao ha consentimento a pedir
 * (RGPD). O preco disto: a mesma pessoa a abrir o link tres vezes conta tres
 * visitas. Para "esta a funcionar o Instagram?" chega.
 *
 * Os robos que leem o link para fazer a pre-visualizacao (WhatsApp, Facebook,
 * Google...) nao contam. Alguem que queira inflacionar os numeros consegue —
 * nao ha nada a ganhar com isso, e os contadores nao mexem em mais nada.
 */


export type Evento = 'VIEW' | 'ORDER' | 'QUOTE';
export const EVENTOS: Evento[] = ['VIEW', 'ORDER', 'QUOTE'];

export const ORIGENS = ['instagram', 'facebook', 'whatsapp', 'google', 'qr', 'direto', 'outro'] as const;
export type Origem = (typeof ORIGENS)[number];

export const ORIGEM_LABEL: Record<Origem, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  google: 'Google',
  qr: 'QR / impressos',
  direto: 'Direto',
  outro: 'Outros sites',
};

/** O parametro `?o=` de cada canal: o que se poe no link de cada sitio. */
export const PARAMETRO_DA_ORIGEM: Partial<Record<Origem, string>> = {
  instagram: 'ig',
  facebook: 'fb',
  whatsapp: 'wa',
  google: 'google',
  qr: 'qr',
};

const DO_PARAMETRO: Record<string, Origem> = Object.fromEntries(
  Object.entries(PARAMETRO_DA_ORIGEM).map(([o, p]) => [p, o as Origem]),
);

/**
 * De onde veio: o `?o=` do link (o mais fiavel — o Instagram nem sempre diz
 * de onde se vem), senao o sitio anterior, senao "direto".
 */
export function origemDoPedido(parametro: string | null | undefined, referer: string | null | undefined): Origem {
  const p = (parametro ?? '').trim().toLowerCase();
  if (p && DO_PARAMETRO[p]) return DO_PARAMETRO[p];
  if (!referer) return 'direto';
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return 'outro';
  }
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'facebook';
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
  return 'outro';
}

/** Robos de pre-visualizacao e indexacao: nao sao pessoas. */
export function eRobo(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp\/|telegram|discord|skype|headless|lighthouse|pingdom|curl|wget|python|node-fetch|vercel/i.test(
    userAgent,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface LinhaDeEstatistica {
  day: string;
  event: Evento;
  source: string;
  count: number;
}

export interface Resumo {
  visitas: number;
  encomendar: number;
  orcamentos: number;
  /** Cliques em Encomendar por visita (0 a 1), ou nulo sem visitas. */
  taxa: number | null;
  porOrigem: Array<{ origem: Origem; visitas: number; encomendar: number }>;
  /** As ultimas semanas, da mais antiga a mais recente; "AAAA-MM-DD" da segunda-feira. */
  porSemana: Array<{ semana: string; visitas: number; encomendar: number }>;
}

/** A segunda-feira da semana de um dia "AAAA-MM-DD". */
export function segundaDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * O resumo dos ultimos `dias` dias (contando hoje) e das ultimas `semanas`
 * semanas, a partir das linhas da tabela.
 */
export function resumir(linhas: LinhaDeEstatistica[], hoje: string, dias = 30, semanas = 8): Resumo {
  const inicio = new Date(`${hoje}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));
  const desde = inicio.toISOString().slice(0, 10);
  const recentes = linhas.filter((l) => l.day >= desde && l.day <= hoje);

  const soma = (ls: LinhaDeEstatistica[], e: Evento) => ls.filter((l) => l.event === e).reduce((a, l) => a + l.count, 0);
  const visitas = soma(recentes, 'VIEW');
  const encomendar = soma(recentes, 'ORDER');

  const porOrigem = ORIGENS.map((origem) => {
    const daOrigem = recentes.filter((l) => l.source === origem);
    return { origem, visitas: soma(daOrigem, 'VIEW'), encomendar: soma(daOrigem, 'ORDER') };
  })
    .filter((o) => o.visitas > 0 || o.encomendar > 0)
    .sort((a, b) => b.visitas - a.visitas);

  const ultimaSegunda = segundaDe(hoje);
  const porSemana = Array.from({ length: semanas }, (_, i) => {
    const d = new Date(`${ultimaSegunda}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * (semanas - 1 - i));
    const semana = d.toISOString().slice(0, 10);
    const daSemana = linhas.filter((l) => segundaDe(l.day) === semana);
    return { semana, visitas: soma(daSemana, 'VIEW'), encomendar: soma(daSemana, 'ORDER') };
  });

  return {
    visitas,
    encomendar,
    orcamentos: soma(recentes, 'QUOTE'),
    taxa: visitas > 0 ? encomendar / visitas : null,
    porOrigem,
    porSemana,
  };
}
