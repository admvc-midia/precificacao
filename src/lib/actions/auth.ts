'use server';

/**
 * Entrar, sair, a primeira conta, e a propria conta.
 *
 * O cookie e `httpOnly`: nenhum JavaScript da pagina lhe toca, por isso um
 * script injectado numa dependencia nao o consegue ler nem enviar para fora.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  acertou,
  chaveDaOrigem,
  COOKIE,
  confereHash,
  depoisDeFalhar,
  DURACAO_CURTA_MS,
  DURACAO_LONGA_MS,
  destinoInterno,
  HASH_FALSO,
  hashPalavraPasse,
  inicioDoPerfil,
  lerSessao,
  normalizarUtilizador,
  novaSessao,
  origemDepoisDeFalhar,
  problemaNaPalavraPasse,
  protegida,
  rotaPermitida,
  utilizadorValido,
  type Perfil,
} from '@/lib/auth';
import { prisma } from '@/lib/db';
import { registar } from '@/lib/registo';
import { exigirSessao } from '@/lib/sessao';
import { errorMessage, type ActionState } from './shared';

/** Atraso fixo em cada tentativa falhada. */
const CASTIGO_MS = 700;

async function gravarCookie(
  quem: { userId: string; perfil: Perfil; versao: number },
  longa: boolean,
) {
  const { valor, expiraEm } = novaSessao(quem, Date.now(), longa ? DURACAO_LONGA_MS : DURACAO_CURTA_MS);
  (await cookies()).set(COOKIE, valor, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  });
}

const castigo = () => new Promise((r) => setTimeout(r, CASTIGO_MS));

/** A sessao atual era das longas ("manter neste aparelho")? Renova-se igual. */
async function sessaoAtualELonga(): Promise<boolean> {
  const s = lerSessao((await cookies()).get(COOKIE)?.value);
  return s !== null && s.expira - Date.now() > DURACAO_CURTA_MS;
}

/** A origem do pedido, e se esta bloqueada. */
async function origem(): Promise<{ chave: string; bloqueadaAte: Date | null }> {
  const h = await headers();
  const chave = chaveDaOrigem(h.get('x-real-ip'), h.get('x-forwarded-for'));
  const t = await prisma.loginThrottle.findUnique({ where: { key: chave } });
  return { chave, bloqueadaAte: t?.lockedUntil && t.lockedUntil > new Date() ? t.lockedUntil : null };
}

async function falhouNaOrigem(chave: string) {
  const atual = await prisma.loginThrottle.findUnique({ where: { key: chave } });
  const novo = origemDepoisDeFalhar(atual);
  await prisma.loginThrottle.upsert({ where: { key: chave }, create: { key: chave, ...novo }, update: novo });
}

const horaFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Lisbon',
});

export async function entrar(_prev: ActionState, form: FormData): Promise<ActionState> {
  let destino = '/';
  try {
    if (!protegida()) {
      throw new Error('A aplicacao ainda nao esta configurada. Ver as instrucoes abaixo.');
    }
    const username = normalizarUtilizador(String(form.get('username') ?? ''));
    const senha = String(form.get('password') ?? '');

    // A origem primeiro: bloqueada, nem se olha para a conta.
    const o = await origem();
    if (o.bloqueadaAte) {
      await castigo();
      throw new Error(`Demasiadas tentativas a partir desta ligacao. Tente depois das ${horaFmt.format(o.bloqueadaAte)}.`);
    }

    const u = await prisma.user.findUnique({ where: { username } });

    if (u?.lockedUntil && u.lockedUntil > new Date()) {
      await castigo();
      throw new Error(`Demasiadas tentativas. A conta fica bloqueada ate as ${horaFmt.format(u.lockedUntil)}.`);
    }

    // Conta inexistente gasta o mesmo tempo a conferir: a demora nao pode
    // dizer que nomes existem.
    const certo = await confereHash(senha, u?.passwordHash ?? HASH_FALSO);
    if (!u || !certo || !u.active) {
      if (u && !certo) {
        await prisma.user.update({ where: { id: u.id }, data: depoisDeFalhar(u.failedLogins) });
      }
      await falhouNaOrigem(o.chave);
      await registar({
        quem: null,
        acao: 'entrar.falhou',
        alvo: username.slice(0, 40) || '(vazio)',
        detalhe: `origem ${o.chave}`,
      });
      await castigo();
      // A mesma mensagem para tudo: nao se diz se o nome existe ou esta desativado.
      throw new Error('Utilizador ou palavra-passe errados.');
    }

    await prisma.user.update({
      where: { id: u.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const longa = form.get('lembrar') === 'on';
    await gravarCookie({ userId: u.id, perfil: u.role, versao: u.sessionVersion }, longa);
    await registar({
      quem: { id: u.id, name: u.name },
      acao: 'entrar',
      detalhe: `${longa ? 'sessao de 30 dias' : 'sessao de 12 horas'}, origem ${o.chave}`,
    });

    destino = u.mustChangePassword
      ? '/conta?trocar=1'
      : // So caminhos deste sitio, e so os que o perfil pode abrir — senao o
        // proxy devolvia-o logo a seguir, sem explicacao.
        (() => {
          const de = destinoInterno(String(form.get('de') ?? ''));
          return de && rotaPermitida(u.role, new URL(de, 'https://x.invalid').pathname)
            ? de
            : inicioDoPerfil(u.role);
        })();
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  // Fora do try: `redirect` funciona lancando.
  redirect(destino);
}

/**
 * A primeira conta de dono. So funciona enquanto nao houver nenhuma conta, e
 * pede a APP_PASSWORD — quem a sabe e quem publicou a aplicacao.
 */
export async function criarPrimeiroDono(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (!protegida()) throw new Error('Falta definir a APP_PASSWORD.');
    if ((await prisma.user.count()) > 0) {
      throw new Error('Ja existe uma conta. Entre com ela.');
    }
    if (!acertou(String(form.get('appPassword') ?? ''))) {
      await castigo();
      throw new Error('A palavra-passe da aplicacao nao confere.');
    }

    const username = normalizarUtilizador(String(form.get('username') ?? ''));
    const name = String(form.get('name') ?? '').trim();
    const senha = String(form.get('password') ?? '');
    if (!utilizadorValido(username)) {
      throw new Error('Nome de utilizador: 3 a 32 letras minusculas, numeros, ponto ou hifen.');
    }
    if (!name) throw new Error('Escreva o seu nome.');
    if (senha !== String(form.get('password2') ?? '')) throw new Error('As palavras-passe nao sao iguais.');
    const problema = problemaNaPalavraPasse(senha, username);
    if (problema) throw new Error(problema);

    const u = await prisma.user.create({
      data: { username, name, role: 'OWNER', passwordHash: await hashPalavraPasse(senha) },
    });
    await gravarCookie({ userId: u.id, perfil: u.role, versao: u.sessionVersion }, false);
    await registar({ quem: { id: u.id, name: u.name }, acao: 'conta.primeiro-dono', alvo: u.username });
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  redirect('/');
}

export async function sair(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect('/entrar');
}

/**
 * Trocar a propria palavra-passe. Pede a atual: uma sessao esquecida aberta
 * num telemovel nao chega para tomar a conta.
 *
 * Termina as sessoes noutros aparelhos e renova a deste.
 */
export async function trocarPalavraPasse(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const eu = await exigirSessao();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: eu.id } });

    if (!(await confereHash(String(form.get('atual') ?? ''), u.passwordHash))) {
      await castigo();
      throw new Error('A palavra-passe atual nao confere.');
    }
    const nova = String(form.get('nova') ?? '');
    if (nova !== String(form.get('nova2') ?? '')) throw new Error('As palavras-passe novas nao sao iguais.');
    const problema = problemaNaPalavraPasse(nova, u.username);
    if (problema) throw new Error(problema);
    if (await confereHash(nova, u.passwordHash)) throw new Error('A nova tem de ser diferente da atual.');

    const depois = await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await hashPalavraPasse(nova),
        sessionVersion: { increment: 1 },
        mustChangePassword: false,
      },
    });
    await gravarCookie({ userId: u.id, perfil: depois.role, versao: depois.sessionVersion }, await sessaoAtualELonga());
    await registar({ quem: eu, acao: 'conta.trocar-palavra-passe' });
    return { ok: true, message: 'Palavra-passe trocada. As outras sessoes foram terminadas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** "Sair de todos os aparelhos", menos este. */
export async function terminarOutrasSessoes(_prev: ActionState): Promise<ActionState> {
  try {
    const eu = await exigirSessao();
    const depois = await prisma.user.update({
      where: { id: eu.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await gravarCookie({ userId: eu.id, perfil: depois.role, versao: depois.sessionVersion }, await sessaoAtualELonga());
    await registar({ quem: eu, acao: 'conta.terminar-outras-sessoes' });
    return { ok: true, message: 'As sessoes noutros aparelhos foram terminadas.' };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
