/**
 * O plano de marketing de partida para a Figueira da Foz (9/10/2026): as
 * campanhas, as tarefas e o guia que o botao "Comecar com as recomendacoes"
 * cria quando o modulo esta vazio. Depois disso tudo vive na base e edita-se
 * na app.
 *
 * As datas sao relativas ao dia em que se carrega no botao (`hoje`), para o
 * plano servir em qualquer altura do ano.
 */

import type { Canal, EstadoCampanha } from './contas';

export interface TarefaDoModelo {
  title: string;
  notes?: string;
  /** Dias a partir de hoje; sem ele, sem prazo. */
  emDias?: number;
}

export interface CampanhaDoModelo {
  title: string;
  objective: string;
  description: string;
  status: EstadoCampanha;
  channels: Canal[];
  startsAt: string | null;
  endsAt: string | null;
  budget: number | null;
  couponCodes: string[];
  tasks: TarefaDoModelo[];
}

/** "AAAA-MM-DD" mais `n` dias. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** O proximo `mes-dia` a partir de hoje (este ano, ou o seguinte se ja passou). */
function proximo(hoje: string, mesDia: string): string {
  const ano = Number(hoje.slice(0, 4));
  const este = `${ano}-${mesDia}`;
  return este >= hoje ? este : `${ano + 1}-${mesDia}`;
}

export function campanhasDoModelo(hoje: string): CampanhaDoModelo[] {
  const natal = proximo(hoje, '12-20');
  const veraoInicio = proximo(hoje, '06-01');
  return [
    {
      title: 'Lançamento do cardápio online',
      objective: 'Dar a conhecer o link do cardápio e trazer as primeiras encomendas por ele.',
      description: [
        'Cupão de boas-vindas na primeira encomenda, 1 uso por cliente, válido 30 dias.',
        '',
        '- Reel "como encomendar em 30 segundos": abrir o link, escolher, carregar no WhatsApp.',
        '- Link do cardápio na bio do Instagram, no WhatsApp Business e no Google.',
      ].join('\n'),
      status: 'PLANNED',
      channels: ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'GOOGLE'],
      startsAt: hoje,
      endsAt: somarDias(hoje, 30),
      budget: null,
      couponCodes: ['BEMVINDA10'],
      tasks: [
        { title: 'Pedir ao dono para criar o cupão BEMVINDA10 (10%, 1 por cliente, 30 dias)', emDias: 1 },
        { title: 'Criar/completar o perfil no Google (fotos, horário, link do cardápio)', emDias: 3, notes: 'Google Business Profile. É o que aparece em "bolos de aniversário Figueira da Foz".' },
        { title: 'Pôr o link do cardápio na bio do Instagram e destaques fixos', notes: 'Destaques: Bolos, Caseirinhos, Brigadeiros, Como encomendar, Avaliações.', emDias: 2 },
        { title: 'WhatsApp Business: catálogo e resposta automática com o link', emDias: 3 },
        { title: 'Gravar e publicar o Reel "como encomendar"', emDias: 5 },
        { title: 'Partilhar no Facebook e nos grupos locais (Figueira, brasileiros na Figueira/Coimbra)', emDias: 6, notes: 'Só nos grupos onde publicidade é permitida.' },
      ],
    },
    {
      title: 'Parcerias locais com cupão próprio',
      objective: 'Ter parceiros que recomendam a AmoBrigs, cada um com o seu código para se medir quem traz encomendas.',
      description: [
        'Levar uma caixinha de degustação com cartão: QR do cardápio + cupão exclusivo do parceiro.',
        'Os que trouxerem encomendas ganham comissão ou caixas grátis.',
        '',
        '## Quem visitar',
        '- Salões de cabeleireiro e estética',
        '- Lojas de noivas e de festas',
        '- Espaços de festas infantis',
        '- Fotógrafos e decoradores de balões',
        '- Quintas de casamentos',
      ].join('\n'),
      status: 'IDEA',
      channels: ['PARTNERS', 'PRINT'],
      startsAt: somarDias(hoje, 7),
      endsAt: null,
      budget: 60,
      couponCodes: [],
      tasks: [
        { title: 'Lista de 10 parceiros possíveis, com morada e contacto', emDias: 7 },
        { title: 'Escolher os primeiros 5 e combinar a visita', emDias: 10 },
        { title: 'Pedir ao dono um cupão por parceiro (ex.: SALAOMARIA)', emDias: 10, notes: 'Juntar os códigos a esta campanha para se ver o resultado de cada um.' },
        { title: 'Cartões com QR do cardápio + código do parceiro', emDias: 12 },
        { title: 'Entregar as caixinhas de degustação', emDias: 14 },
        { title: 'Ver ao fim de 1 mês quantas encomendas cada código trouxe', emDias: 45 },
      ],
    },
    {
      title: 'Indique uma amiga',
      objective: 'Pôr os clientes a trazer clientes.',
      description: [
        'Quem indica e quem é indicado ganham desconto.',
        'Na encomenda, preencher sempre "Como nos conheceu → Indicação" e quem indicou: a app guarda.',
      ].join('\n'),
      status: 'IDEA',
      channels: ['WHATSAPP', 'INSTAGRAM'],
      startsAt: null,
      endsAt: null,
      budget: null,
      couponCodes: ['AMIGA10'],
      tasks: [
        { title: 'Combinar com o dono a regra e o cupão AMIGA10' },
        { title: 'Texto para mandar aos clientes com consentimento (WhatsApp)' },
        { title: 'Cartão "indique uma amiga" para pôr nas caixas' },
      ],
    },
    {
      title: 'Datas comemorativas',
      objective: 'Vender kits nas datas fortes, com prazo de encomenda.',
      description: [
        'Kits em combo, com "encomendas até dia X". Divulgar cerca de **2 semanas antes**.',
        'O Calendário de produção da app já tem as datas de Portugal e do Brasil.',
        '',
        '## Datas',
        '- Dia dos Namorados (14/2)',
        '- Dia do Pai em Portugal (19/3)',
        '- Páscoa',
        '- Dia da Mãe (1.º domingo de maio em PT, 2.º no BR)',
        '- São João (24/6, feriado municipal na Figueira) e festa junina',
        '- Dia da Criança (1/6 em PT, 12/10 no BR)',
        '- Halloween e Natal',
      ].join('\n'),
      status: 'PLANNED',
      channels: ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'ADS'],
      startsAt: null,
      endsAt: null,
      budget: null,
      couponCodes: [],
      tasks: [
        { title: 'Escolher as datas do próximo trimestre e o kit de cada uma', emDias: 7 },
        { title: 'Pedir ao dono o combo/promoção de cada kit', emDias: 10 },
        { title: 'Fotos dos kits para as publicações', emDias: 12 },
        { title: 'Agendar publicações 2 semanas antes de cada data', emDias: 14 },
      ],
    },
    {
      title: 'Natal para empresas',
      objective: 'Caixas de brigadeiros personalizadas como presente de Natal de empresas locais.',
      description: [
        'Caixas com cartão ou etiqueta personalizada, para clientes e funcionários.',
        'Uma visita com uma amostra converte muito melhor do que um email.',
        '',
        '## Alvos',
        '- Imobiliárias',
        '- Clínicas',
        '- Contabilidade e advogados',
        '- Stands de automóveis',
        '- Ginásios',
      ].join('\n'),
      status: 'PLANNED',
      channels: ['PARTNERS', 'PRINT'],
      startsAt: hoje,
      endsAt: natal,
      budget: 80,
      couponCodes: [],
      tasks: [
        { title: 'Lista de 20 empresas da Figueira com contacto', emDias: 5 },
        { title: 'Folheto/cartão com as caixas, preços por quantidade e prazo', emDias: 7, notes: 'Pedir ao dono a promoção "preço por quantidade".' },
        { title: 'Caixinhas de amostra para as visitas', emDias: 10 },
        { title: 'Visitar as empresas (5 por semana)', emDias: 14 },
        { title: 'Último dia para encomendas de Natal: avisar quem visitou', emDias: Math.max(1, diasEntre(hoje, natal) - 10) },
      ],
    },
    {
      title: 'Verão e turismo',
      objective: 'Chegar a quem passa férias na Figueira.',
      description: [
        'Parcerias com alojamentos locais e pequenos hotéis: caixa de boas-vindas para os hóspedes, com o cartão do cardápio.',
        '',
        '> Cuidado com o calor: o buttercream derrete. No verão, preferir caseirinhos e brigadeiros bem embalados.',
      ].join('\n'),
      status: 'IDEA',
      channels: ['PARTNERS', 'INSTAGRAM'],
      startsAt: veraoInicio,
      endsAt: somarDias(veraoInicio, 106),
      budget: null,
      couponCodes: [],
      tasks: [
        { title: 'Lista de alojamentos locais e hotéis pequenos', emDias: diasEntre(hoje, veraoInicio) - 45 > 0 ? diasEntre(hoje, veraoInicio) - 45 : undefined },
        { title: 'Proposta da caixa de boas-vindas (preço por quantidade)' },
      ],
    },
  ];
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export interface SecaoDoGuia {
  title: string;
  body: string;
}

export const GUIA_DO_MODELO: SecaoDoGuia[] = [
  {
    title: 'A base',
    body: [
      '### Google',
      'Perfil no Google com fotos, horário, o link do cardápio e "encomendas por WhatsApp". Pedir **avaliação no Google** a cada cliente satisfeito: em Portugal pesam muito.',
      '',
      '### Instagram',
      'Link do cardápio na bio. Destaques fixos: Bolos, Caseirinhos, Brigadeiros, Como encomendar, Avaliações. Marcar a localização "Figueira da Foz" em todas as publicações.',
      '',
      '### Facebook',
      'Chega a muita gente acima dos 35 (mães e avós que encomendam bolos de aniversário). Mesmas publicações + grupos locais da Figueira e de brasileiros na Figueira/Coimbra, onde publicidade é permitida.',
      '',
      '### WhatsApp Business',
      'Catálogo com os produtos, resposta automática com o link do cardápio e estados com a produção do dia.',
    ].join('\n'),
  },
  {
    title: 'Conteúdo que funciona',
    body: [
      '- **Reels curtos** (7–20 s) da produção: brigadeiro a ser enrolado, corte do bolo, montagem da caixa.',
      '- 3 a 4 publicações por semana e stories todos os dias.',
      '- Publicações em colaboração ("Collab") com os parceiros.',
      '- Partilhar as fotos dos clientes, sempre com autorização.',
      '',
      '## Hashtags',
      '#figueiradafoz #figueira #buarcos #coimbra #bolosdeaniversario #brigadeirogourmet #docesportugal',
    ].join('\n'),
  },
  {
    title: 'Anúncios pagos',
    body: [
      '- **3 a 5 €/dia**, raio de 15–20 km da Figueira, objetivo "mensagens" para o WhatsApp.',
      '- Impulsionar o Reel que já teve mais alcance, em vez de criar anúncios do zero.',
      '- Campanhas curtas (7–10 dias) antes das datas fortes, não o ano inteiro.',
    ].join('\n'),
  },
  {
    title: 'Impressos e feiras',
    body: [
      '- **Cartão ou autocolante em todas as caixas**: QR do cardápio + "volte com 10%" (cupão de cliente regular).',
      '- Flyers só com autorização e onde está o público: parceiros, creches/ATL, ginásios. Na rua converte pouco.',
      '- Mercados de artesanato e de Natal: bons para provar e recolher contactos. Confirmar na Câmara as licenças para vender alimentos.',
    ].join('\n'),
  },
  {
    title: 'Regras em Portugal',
    body: [
      '- **RGPD:** só mandar promoções pelo WhatsApp a quem deu consentimento (a app pede-o na encomenda).',
      '- **Passatempos:** sorteios por sorte podem precisar de autorização prévia. Preferir passatempos por mérito (melhor foto, melhor frase). Confirmar antes de lançar.',
      '- Preços sempre com IVA; informação de alergénios disponível.',
      '- **Livro de Reclamações eletrónico** registado (obrigatório).',
    ].join('\n'),
  },
  {
    title: 'Como medir',
    body: [
      '- **Um cupão por canal:** IG10 no Instagram, GOOGLE10 no Google, um por parceiro. Juntar os códigos a cada campanha: a campanha mostra quantas encomendas os usaram.',
      '- Na encomenda, preencher sempre "Como nos conheceu".',
      '- Uma vez por mês: cortar o que não trouxe encomendas e reforçar o que trouxe.',
    ].join('\n'),
  },
];
