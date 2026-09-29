import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acertou, novaSessao, protegida, sessaoValida } from '@/lib/auth';

const ORIGINAL = process.env.APP_PASSWORD;

beforeEach(() => {
  process.env.APP_PASSWORD = 'pao-de-queijo-42';
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL;
});

describe('palavra-passe', () => {
  it('aceita a certa e recusa tudo o resto', () => {
    expect(acertou('pao-de-queijo-42')).toBe(true);
    expect(acertou('pao-de-queijo-43')).toBe(false);
    expect(acertou('pao-de-queijo-4')).toBe(false);
    expect(acertou('')).toBe(false);
    expect(acertou('PAO-DE-QUEIJO-42')).toBe(false);
  });

  it('sem APP_PASSWORD nao ha ninguem a entrar', () => {
    delete process.env.APP_PASSWORD;
    expect(protegida()).toBe(false);
    expect(acertou('')).toBe(false);
    expect(acertou('seja o que for')).toBe(false);
  });

  it('espacos a volta nao contam como palavra-passe', () => {
    process.env.APP_PASSWORD = '   ';
    expect(protegida()).toBe(false);
  });
});

describe('cookie de sessao', () => {
  it('o que assinamos e aceite', () => {
    expect(sessaoValida(novaSessao().valor)).toBe(true);
  });

  it('recusa um cookie ausente ou sem forma', () => {
    expect(sessaoValida(undefined)).toBe(false);
    expect(sessaoValida('')).toBe(false);
    expect(sessaoValida('sem-ponto')).toBe(false);
    expect(sessaoValida('.soAssinatura')).toBe(false);
  });

  it('recusa assinatura alterada', () => {
    const { valor } = novaSessao();
    const [dados, assinatura] = valor.split('.');
    expect(sessaoValida(`${dados}.${assinatura.slice(0, -1)}X`)).toBe(false);
  });

  it('nao deixa esticar a validade mexendo na data', () => {
    // O ataque obvio: manter a assinatura e adiar o prazo. A data esta dentro
    // do que foi assinado, por isso a assinatura deixa de bater.
    const { valor } = novaSessao();
    const assinatura = valor.slice(valor.lastIndexOf('.') + 1);
    const daquiAUmAno = Date.now() + 365 * 24 * 60 * 60 * 1000;
    expect(sessaoValida(`${daquiAUmAno}.${assinatura}`)).toBe(false);
  });

  it('expira', () => {
    const { valor } = novaSessao();
    const daquiA31Dias = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(sessaoValida(valor, daquiA31Dias)).toBe(false);
    expect(sessaoValida(valor, Date.now() + 29 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('trocar a palavra-passe expulsa quem estava dentro', () => {
    const { valor } = novaSessao();
    expect(sessaoValida(valor)).toBe(true);
    process.env.APP_PASSWORD = 'outra-qualquer';
    expect(sessaoValida(valor)).toBe(false);
  });

  it('sem APP_PASSWORD nenhum cookie serve', () => {
    const { valor } = novaSessao();
    delete process.env.APP_PASSWORD;
    expect(sessaoValida(valor)).toBe(false);
  });
});
