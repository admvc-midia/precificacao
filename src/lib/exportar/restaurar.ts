/**
 * Restaurar uma copia completa: a base volta a ficar como no dia da copia.
 *
 * Substitui, nao junta. Juntar parece mais seguro mas nao desfaz um erro e
 * da conflitos sem resposta certa (uma ficha mudada dos dois lados). A rede
 * de seguranca e outra: antes de restaurar grava-se uma copia do estado
 * atual (ver `lib/actions/copia.ts`), e um restauro errado desfaz-se com ela.
 *
 * Fica de fora o que uma copia nao deve mexer:
 *  - **contas** (`User`): a copia nao leva as palavras-passe, e restaurar nao
 *    pode deixar ninguem fora da app — nem o dono que esta a restaurar;
 *  - **registo** (`AuditLog`): nada na app o apaga, e um restauro e
 *    precisamente o que la deve ficar escrito;
 *  - **tentativas de entrada** (`LoginThrottle`): sao de agora, nao da copia.
 *
 * Tudo numa transacao: ou fica tudo como na copia, ou fica tudo como estava.
 * As tabelas e a ordem saem do proprio schema — uma tabela nova entra no
 * restauro no dia em que entra no schema, como na copia.
 *
 * Fora de `lib/actions/` de proposito: apaga a base sem perguntar quem pede.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { MODELOS, type ModeloDaBase } from '@/generated/modelo';
import { prisma, tabela } from '@/lib/db';

/** Tabelas que o restauro nunca toca. */
export const NAO_SE_RESTAURAM = ['User', 'AuditLog', 'LoginThrottle'];

/** Uma copia tem uns 100 KB; isto e o tecto das actions com folga. */
export const MAX_COPIA = 3_800_000;

type Modelo = ModeloDaBase;
type Linha = Record<string, unknown>;

/** As tabelas e os campos, escritos em cada `prisma generate` (ver tools/gerador-modelo.mjs). */
function modelos(): readonly Modelo[] {
  return MODELOS;
}

function acessor(modelo: string): string {
  return modelo.charAt(0).toLowerCase() + modelo.slice(1);
}

/** Campos que sao colunas (nao relacoes): os que a copia traz. */
function colunas(m: Modelo) {
  return m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
}

/** Chaves estrangeiras deste modelo: a coluna e o modelo para onde aponta. */
function chaves(m: Modelo): Array<{ coluna: string; alvo: string; obrigatoria: boolean }> {
  return m.fields
    .filter((f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 0)
    .flatMap((f) =>
      f.relationFromFields!.map((coluna) => ({
        coluna,
        alvo: f.type,
        obrigatoria: m.fields.find((c) => c.name === coluna)?.isRequired ?? false,
      })),
    );
}

/** Os modelos que se restauram. */
export function restauraveis(): Modelo[] {
  return modelos().filter((m) => !NAO_SE_RESTAURAM.includes(m.name));
}

/**
 * A ordem de insercao: cada tabela depois das tabelas para onde aponta.
 * Apagar faz-se ao contrario. Uma tabela que aponta para si propria (o
 * cliente que indicou outro) nao conta aqui — essa coluna preenche-se depois.
 * Um ciclo entre tabelas diferentes nao tem ordem possivel: rebenta, e o
 * teste que chama isto apanha-o no dia em que o schema o criar.
 */
export function ordemDeInsercao(): string[] {
  const lista = restauraveis();
  const nomes = new Set(lista.map((m) => m.name));
  const feitos: string[] = [];
  const aVisitar = new Set<string>();

  function visitar(m: Modelo) {
    if (feitos.includes(m.name)) return;
    if (aVisitar.has(m.name)) throw new Error(`Ciclo entre tabelas em ${m.name}: o restauro nao tem ordem.`);
    aVisitar.add(m.name);
    for (const k of chaves(m)) {
      if (k.alvo !== m.name && nomes.has(k.alvo)) visitar(lista.find((x) => x.name === k.alvo)!);
    }
    aVisitar.delete(m.name);
    feitos.push(m.name);
  }
  for (const m of lista) visitar(m);
  return feitos;
}

/**
 * Uma tabela que fica (as contas) nao pode apontar para uma que se restaura:
 * apagar esta ultima levava linhas da primeira em cascata. Hoje nenhuma
 * aponta; isto garante que continua assim.
 */
export function confirmarSeparacao(): void {
  const restauradas = new Set(restauraveis().map((m) => m.name));
  for (const m of modelos().filter((x) => NAO_SE_RESTAURAM.includes(x.name))) {
    for (const k of chaves(m)) {
      if (restauradas.has(k.alvo)) {
        throw new Error(`${m.name}.${k.coluna} aponta para ${k.alvo}: o restauro apagava contas ou registo.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ler a copia
// ---------------------------------------------------------------------------

export interface CopiaLida {
  gravadoEm: string;
  versao: string;
  /** So as tabelas que se restauram, com so as colunas que existem hoje. */
  tabelas: Record<string, Linha[]>;
  /** Coisas que nao impedem o restauro mas convem saber. */
  avisos: string[];
}

const NAO_E_COPIA = 'Este ficheiro nao e uma copia completa desta app (a que se descarrega em Copia de seguranca).';

/**
 * Le e confere a copia, sem tocar na base. Recusa o que nao se consegue
 * restaurar por inteiro: melhor dizer que nao antes do que a meio.
 */
export function lerCopia(texto: string): CopiaLida {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error(NAO_E_COPIA);
  }
  const c = bruto as { app?: unknown; versao?: unknown; gravadoEm?: unknown; tabelas?: unknown };
  if (
    !c ||
    typeof c !== 'object' ||
    c.app !== 'precificaragao' ||
    typeof c.gravadoEm !== 'string' ||
    Number.isNaN(Date.parse(c.gravadoEm)) ||
    !c.tabelas ||
    typeof c.tabelas !== 'object' ||
    Array.isArray(c.tabelas)
  ) {
    throw new Error(NAO_E_COPIA);
  }
  const naCopia = c.tabelas as Record<string, unknown>;
  const avisos: string[] = [];
  const conhecidas = new Set(modelos().map((m) => m.name));

  // Uma tabela que ja nao existe: vazia nao faz falta; com dados, perdiam-se.
  for (const [nome, linhas] of Object.entries(naCopia)) {
    if (conhecidas.has(nome)) continue;
    if (Array.isArray(linhas) && linhas.length === 0) continue;
    throw new Error(
      `A copia tem dados em "${nome}", que ja nao existe nesta versao da app. Restaurar perdia-os — fale com quem mantem a app.`,
    );
  }

  const tabelas: Record<string, Linha[]> = {};
  for (const m of restauraveis()) {
    const linhas = naCopia[m.name];
    if (linhas === undefined) {
      // Copia de antes de esta tabela existir: fica vazia, como estava nesse dia.
      tabelas[m.name] = [];
      continue;
    }
    if (!Array.isArray(linhas) || linhas.some((l) => !l || typeof l !== 'object' || Array.isArray(l))) {
      throw new Error(NAO_E_COPIA);
    }
    const cols = colunas(m);
    const nomesCols = new Set(cols.map((f) => f.name));
    const obrigatorias = cols.filter((f) => f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt);

    const ignoradas = new Set<string>();
    tabelas[m.name] = (linhas as Linha[]).map((l) => {
      for (const f of obrigatorias) {
        if (l[f.name] === undefined || l[f.name] === null) {
          throw new Error(
            `A copia e de uma versao antiga: falta "${f.name}" em ${m.name}, que hoje e obrigatorio. Nao da para a restaurar inteira.`,
          );
        }
      }
      const limpa: Linha = {};
      for (const [k, v] of Object.entries(l)) {
        if (nomesCols.has(k)) limpa[k] = v;
        else ignoradas.add(k);
      }
      return limpa;
    });
    if (ignoradas.size > 0) {
      avisos.push(`${m.name}: ${[...ignoradas].join(', ')} ja nao existe(m) e fica(m) de fora.`);
    }
  }

  return {
    gravadoEm: c.gravadoEm,
    versao: typeof c.versao === 'string' ? c.versao : '?',
    tabelas,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// O que muda
// ---------------------------------------------------------------------------

export interface LinhaDaAnalise {
  modelo: string;
  agora: number;
  naCopia: number;
  /** Linhas de agora criadas depois da copia: as que se perdem de certeza. */
  depoisDaCopia: number;
}

/** Agora → na copia, por tabela. Le a base, nao escreve. */
export async function analisarCopia(c: CopiaLida): Promise<LinhaDaAnalise[]> {
  const cliente = prisma as unknown as Record<string, { count: (a?: unknown) => Promise<number> }>;
  const quando = new Date(c.gravadoEm);
  const out: LinhaDaAnalise[] = [];
  // Uma de cada vez: poucas ligacoes no pooler, e isto nao tem pressa.
  for (const m of restauraveis()) {
    const t = cliente[acessor(m.name)];
    const temCriado = m.fields.some((f) => f.name === 'createdAt' && f.type === 'DateTime');
    out.push({
      modelo: m.name,
      agora: await t.count(),
      naCopia: c.tabelas[m.name].length,
      depoisDaCopia: temCriado ? await t.count({ where: { createdAt: { gt: quando } } }) : 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Restaurar
// ---------------------------------------------------------------------------

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/** Tantas linhas por INSERT: longe do limite de parametros do Postgres. */
const LOTE = 500;

/**
 * Substitui as tabelas pelas da copia. Devolve quantas linhas ficaram em cada.
 * Quem chama ja tem de ter gravado a copia de antes.
 */
export async function restaurar(c: CopiaLida): Promise<Record<string, number>> {
  confirmarSeparacao();
  const ordem = ordemDeInsercao();
  const porNome = new Map(restauraveis().map((m) => [m.name, m]));

  return prisma.$transaction(
    async (tx: Tx) => {
      const t = tx as unknown as Record<
        string,
        {
          deleteMany: () => Promise<unknown>;
          createMany: (a: { data: Linha[] }) => Promise<unknown>;
          update: (a: { where: Linha; data: Linha }) => Promise<unknown>;
          findMany: (a: unknown) => Promise<Linha[]>;
        }
      >;

      // Filhos antes dos pais.
      for (const nome of [...ordem].reverse()) await t[acessor(nome)].deleteMany();

      // Contas que existem hoje: quem ja nao existe fica "sem autor".
      const contas = new Set((await t.user.findMany({ select: { id: true } })).map((u) => String(u.id)));

      const contagem: Record<string, number> = {};
      for (const nome of ordem) {
        const m = porNome.get(nome)!;
        const ks = chaves(m);
        const proprias = ks.filter((k) => k.alvo === nome);
        const paraContas = ks.filter((k) => k.alvo === 'User');
        const depois: Array<{ id: unknown; dados: Linha }> = [];

        const linhas = c.tabelas[nome].map((original) => {
          const l = { ...original };
          for (const k of paraContas) {
            if (l[k.coluna] != null && !contas.has(String(l[k.coluna]))) {
              if (k.obrigatoria) throw new Error(`${nome}: a conta ${String(l[k.coluna])} ja nao existe.`);
              l[k.coluna] = null;
            }
          }
          // Quem aponta para a propria tabela: entra vazio e preenche-se no fim,
          // quando a linha para onde aponta ja existe.
          const adiadas: Linha = {};
          for (const k of proprias) {
            if (l[k.coluna] != null) {
              adiadas[k.coluna] = l[k.coluna];
              l[k.coluna] = null;
            }
          }
          if (Object.keys(adiadas).length > 0) {
            // O update mexia no "alterado em"; fica o da copia.
            for (const f of m.fields) if (f.isUpdatedAt && l[f.name] != null) adiadas[f.name] = l[f.name];
            depois.push({ id: l.id, dados: adiadas });
          }
          return l;
        });

        for (let i = 0; i < linhas.length; i += LOTE) {
          await t[acessor(nome)].createMany({ data: linhas.slice(i, i + LOTE) });
        }
        for (const d of depois) await t[acessor(nome)].update({ where: { id: d.id }, data: d.dados });
        contagem[nome] = linhas.length;

        // Numeros automaticos (o das encomendas) continuam a partir do maior da copia.
        // Schema sempre explicito (ver `tabela` em lib/db.ts).
        for (const f of m.fields) {
          if (f.defaultFn !== 'autoincrement') continue;
          const t = tabela(nome);
          await tx.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${f.name}'), COALESCE((SELECT MAX("${f.name}") FROM ${t}), 0) + 1, false)`,
          );
        }
      }
      return contagem;
    },
    // A ligacao a Supabase e lenta; o padrao de 5 s nao chega para a base toda.
    { maxWait: 15_000, timeout: 120_000 },
  );
}
