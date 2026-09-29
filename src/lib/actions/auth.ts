'use server';

/**
 * Entrar e sair.
 *
 * O cookie e `httpOnly`: nenhum JavaScript da pagina lhe toca, por isso um
 * script injectado numa dependencia nao o consegue ler nem enviar para fora.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { acertou, COOKIE, novaSessao, protegida } from '@/lib/auth';
import { errorMessage, type ActionState } from './shared';

/** Atraso fixo em cada tentativa falhada. */
const CASTIGO_MS = 700;

function caminhoInterno(valor: string): string {
  // So caminhos deste sitio. Sem isto, `/entrar?de=https://outro-sitio` fazia
  // da pagina de entrada um trampolim para qualquer lado — e um link desses
  // parece nosso a quem o recebe.
  if (!valor.startsWith('/') || valor.startsWith('//')) return '/';
  return valor;
}

export async function entrar(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let destino = '/';

  try {
    if (!protegida()) {
      throw new Error(
        'A aplicacao ainda nao tem palavra-passe definida. Ver as instrucoes abaixo.',
      );
    }

    if (!acertou(String(form.get('password') ?? ''))) {
      // Um erro instantaneo convida a tentar a lista toda. Isto nao substitui
      // uma palavra-passe boa — so encarece a forca bruta.
      await new Promise((r) => setTimeout(r, CASTIGO_MS));
      throw new Error('Palavra-passe errada.');
    }

    const { valor, expiraEm } = novaSessao();
    const jar = await cookies();
    jar.set(COOKIE, valor, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiraEm,
    });

    destino = caminhoInterno(String(form.get('de') ?? '/'));
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }

  // Fora do try: `redirect` funciona lancando, e apanha-lo aqui daria um
  // "erro" a quem acabou de acertar na palavra-passe.
  redirect(destino);
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
  redirect('/entrar');
}
