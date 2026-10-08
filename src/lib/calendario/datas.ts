/**
 * As datas que a app ja conhece: feriados de Portugal e as datas que vendem
 * doces em Portugal e no Brasil. Calculadas aqui, sem internet — a Pascoa e o
 * que dela depende (Carnaval, Sexta-feira Santa, Corpo de Deus) mudam todos os
 * anos, e o Dia da Mae cai num domingo diferente em cada pais.
 *
 * As mesmas festas tem dias diferentes nos dois paises, e isso conta para
 * quem vende aos dois publicos: o Dia da Crianca e a 1 de junho em Portugal e
 * a 12 de outubro no Brasil; o Dia da Mae e no 1.o domingo de maio em
 * Portugal e no 2.o no Brasil; o Dia do Pai a 19 de marco em Portugal e no 2.o
 * domingo de agosto no Brasil.
 *
 * A `chave` nao leva o ano: e por ela que o plano de producao e as notas de
 * uma data passam de um ano para o seguinte.
 */

export type Pais = 'PT' | 'BR';

export interface DataConhecida {
  chave: string;
  titulo: string;
  /** AAAA-MM-DD. */
  dia: string;
  paises: Pais[];
  /** Feriado nacional em Portugal: a loja e os fornecedores podem fechar. */
  feriado: boolean;
  nota?: string;
}

const d2 = (n: number) => String(n).padStart(2, '0');
const iso = (ano: number, mes: number, dia: number) => `${ano}-${d2(mes)}-${d2(dia)}`;

/** Domingo de Pascoa (calendario gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** AAAA-MM-DD mais `n` dias. Em UTC, para nenhum fuso mudar o dia. */
export function somarDias(dia: string, n: number): string {
  const t = new Date(`${dia}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** O n-esimo dia da semana do mes (0 = domingo): o 2.o domingo de maio. */
export function nesimo(ano: number, mes: number, diaDaSemana: number, n: number): string {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const dia = 1 + ((diaDaSemana - primeiro + 7) % 7) + (n - 1) * 7;
  return iso(ano, mes, dia);
}

/** Todas as datas conhecidas do ano, por ordem. */
export function datasDoAno(ano: number): DataConhecida[] {
  const p = pascoa(ano);
  const PT: Pais[] = ['PT'];
  const BR: Pais[] = ['BR'];
  const AMBOS: Pais[] = ['PT', 'BR'];
  // A Black Friday e o dia seguinte a 4.a quinta-feira de novembro.
  const blackFriday = somarDias(nesimo(ano, 11, 4, 4), 1);

  const lista: DataConhecida[] = [
    // Feriados nacionais de Portugal.
    { chave: 'ano-novo', titulo: 'Ano Novo', dia: iso(ano, 1, 1), paises: AMBOS, feriado: true },
    { chave: 'sexta-santa', titulo: 'Sexta-feira Santa', dia: somarDias(p, -2), paises: AMBOS, feriado: true },
    { chave: 'pascoa', titulo: 'Páscoa', dia: p, paises: AMBOS, feriado: true, nota: 'Ovos e folares: as encomendas chegam nas duas semanas antes.' },
    { chave: 'liberdade', titulo: 'Dia da Liberdade', dia: iso(ano, 4, 25), paises: PT, feriado: true },
    { chave: 'trabalhador', titulo: 'Dia do Trabalhador', dia: iso(ano, 5, 1), paises: AMBOS, feriado: true },
    { chave: 'corpo-de-deus', titulo: 'Corpo de Deus', dia: somarDias(p, 60), paises: PT, feriado: true },
    { chave: 'portugal', titulo: 'Dia de Portugal', dia: iso(ano, 6, 10), paises: PT, feriado: true },
    { chave: 'assuncao', titulo: 'Assunção de Nossa Senhora', dia: iso(ano, 8, 15), paises: PT, feriado: true },
    { chave: 'republica', titulo: 'Implantação da República', dia: iso(ano, 10, 5), paises: PT, feriado: true },
    { chave: 'todos-os-santos', titulo: 'Dia de Todos os Santos', dia: iso(ano, 11, 1), paises: PT, feriado: true },
    { chave: 'restauracao', titulo: 'Restauração da Independência', dia: iso(ano, 12, 1), paises: PT, feriado: true },
    { chave: 'imaculada', titulo: 'Imaculada Conceição', dia: iso(ano, 12, 8), paises: PT, feriado: true },
    { chave: 'natal', titulo: 'Natal', dia: iso(ano, 12, 25), paises: AMBOS, feriado: true },

    // Datas que vendem — Portugal.
    { chave: 'reis', titulo: 'Dia de Reis', dia: iso(ano, 1, 6), paises: PT, feriado: false, nota: 'Bolo-rei.' },
    { chave: 'dia-do-pai-pt', titulo: 'Dia do Pai (PT)', dia: iso(ano, 3, 19), paises: PT, feriado: false },
    { chave: 'dia-da-mae-pt', titulo: 'Dia da Mãe (PT)', dia: nesimo(ano, 5, 0, 1), paises: PT, feriado: false },
    { chave: 'dia-da-crianca-pt', titulo: 'Dia da Criança (PT)', dia: iso(ano, 6, 1), paises: PT, feriado: false },
    { chave: 'santo-antonio', titulo: 'Santo António', dia: iso(ano, 6, 13), paises: PT, feriado: false, nota: 'Feriado em Lisboa.' },
    { chave: 'sao-martinho', titulo: 'São Martinho', dia: iso(ano, 11, 11), paises: PT, feriado: false },

    // Datas que vendem — Brasil.
    { chave: 'dia-das-maes-br', titulo: 'Dia das Mães (BR)', dia: nesimo(ano, 5, 0, 2), paises: BR, feriado: false },
    { chave: 'namorados-br', titulo: 'Dia dos Namorados (BR)', dia: iso(ano, 6, 12), paises: BR, feriado: false },
    { chave: 'dia-dos-pais-br', titulo: 'Dia dos Pais (BR)', dia: nesimo(ano, 8, 0, 2), paises: BR, feriado: false },
    { chave: 'cosme-damiao', titulo: 'São Cosme e Damião', dia: iso(ano, 9, 27), paises: BR, feriado: false, nota: 'Tradição de dar doces às crianças.' },
    { chave: 'criancas-br', titulo: 'Dia das Crianças (BR)', dia: iso(ano, 10, 12), paises: BR, feriado: false },

    // Dos dois.
    { chave: 'carnaval', titulo: 'Carnaval', dia: somarDias(p, -47), paises: AMBOS, feriado: false, nota: 'Em Portugal costuma haver tolerância de ponto.' },
    { chave: 'namorados', titulo: 'Dia dos Namorados (PT)', dia: iso(ano, 2, 14), paises: PT, feriado: false, nota: 'São Valentim.' },
    { chave: 'dia-da-mulher', titulo: 'Dia da Mulher', dia: iso(ano, 3, 8), paises: AMBOS, feriado: false },
    { chave: 'sao-joao', titulo: 'São João · Festa Junina', dia: iso(ano, 6, 24), paises: AMBOS, feriado: false, nota: 'Feriado no Porto; no Brasil, o auge das festas juninas.' },
    { chave: 'halloween', titulo: 'Halloween', dia: iso(ano, 10, 31), paises: AMBOS, feriado: false },
    { chave: 'black-friday', titulo: 'Black Friday', dia: blackFriday, paises: AMBOS, feriado: false },
    { chave: 'vespera-natal', titulo: 'Véspera de Natal', dia: iso(ano, 12, 24), paises: AMBOS, feriado: false },
    { chave: 'passagem-de-ano', titulo: 'Passagem de Ano', dia: iso(ano, 12, 31), paises: AMBOS, feriado: false },
  ];
  return lista.sort((a, b) => a.dia.localeCompare(b.dia) || a.titulo.localeCompare(b.titulo));
}

/** Uma data conhecida pela chave, num ano. */
export function dataConhecida(chave: string, ano: number): DataConhecida | undefined {
  return datasDoAno(ano).find((d) => d.chave === chave);
}
