import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acertou,
  chaveDaOrigem,
  DURACAO_CURTA_MS,
  DURACAO_LONGA_MS,
  novoSegredo,
  ORIGEM_BLOQUEIO_MS,
  ORIGEM_FALHAS_MAX,
  origemDepoisDeFalhar,
  SEGREDO_MINIMO,
  confereHash,
  depoisDeFalhar,
  destinoInterno,
  HASH_FALSO,
  hashPalavraPasse,
  inicioDoPerfil,
  lerSessao,
  novaSessao,
  problemaNaPalavraPasse,
  protegida,
  rotaPermitida,
  TENTATIVAS_MAX,
  utilizadorValido,
} from '@/lib/auth';

const ORIGINAL = process.env.APP_PASSWORD;
const SEGREDO_ORIGINAL = process.env.SESSION_SECRET;
const SEGREDO = 'um-segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
const ANA = { userId: 'u1', perfil: 'KITCHEN' as const, versao: 3 };

beforeEach(() => {
  process.env.APP_PASSWORD = 'pao-de-queijo-42';
  process.env.SESSION_SECRET = SEGREDO;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL;
  if (SEGREDO_ORIGINAL === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = SEGREDO_ORIGINAL;
});

describe('palavra-passe da aplicacao', () => {
  it('aceita a certa e recusa tudo o resto', () => {
    expect(acertou('pao-de-queijo-42')).toBe(true);
    expect(acertou('pao-de-queijo-43')).toBe(false);
    expect(acertou('')).toBe(false);
    expect(acertou('PAO-DE-QUEIJO-42')).toBe(false);
  });

  it('sem APP_PASSWORD nao ha ninguem a entrar', () => {
    delete process.env.APP_PASSWORD;
    expect(protegida()).toBe(false);
    expect(acertou('')).toBe(false);
  });

  it('com as duas variaveis, esta configurada', () => {
    expect(protegida()).toBe(true);
  });

  it('espacos a volta nao contam como palavra-passe', () => {
    process.env.APP_PASSWORD = '   ';
    expect(protegida()).toBe(false);
  });
});

describe('cookie de sessao', () => {
  it('o que assinamos le-se de volta, com quem e o perfil', () => {
    const s = lerSessao(novaSessao(ANA).valor);
    expect(s).toMatchObject(ANA);
  });

  it('recusa um cookie ausente ou sem forma', () => {
    expect(lerSessao(undefined)).toBeNull();
    expect(lerSessao('')).toBeNull();
    expect(lerSessao('sem-ponto')).toBeNull();
    expect(lerSessao('.soAssinatura')).toBeNull();
  });

  it('recusa assinatura alterada', () => {
    const { valor } = novaSessao(ANA);
    expect(lerSessao(`${valor.slice(0, -1)}X`)).toBeNull();
  });

  it('nao deixa promover-se a dono mexendo nos dados', () => {
    // O ataque obvio: trocar KITCHEN por OWNER e manter a assinatura.
    const { valor } = novaSessao(ANA);
    const assinatura = valor.slice(valor.lastIndexOf('.') + 1);
    const forjado = Buffer.from(
      JSON.stringify({ u: 'u1', p: 'OWNER', v: 3, e: Date.now() + 1e9 }),
    ).toString('base64url');
    expect(lerSessao(`${forjado}.${assinatura}`)).toBeNull();
  });

  it('expira', () => {
    const { valor } = novaSessao(ANA, Date.now(), DURACAO_LONGA_MS);
    expect(lerSessao(valor, Date.now() + 31 * 86_400_000)).toBeNull();
    expect(lerSessao(valor, Date.now() + 29 * 86_400_000)).not.toBeNull();
  });

  it('trocar a SESSION_SECRET expulsa toda a gente; a APP_PASSWORD ja nao', () => {
    const { valor } = novaSessao(ANA);
    process.env.APP_PASSWORD = 'outra-qualquer';
    expect(lerSessao(valor)).not.toBeNull();
    process.env.SESSION_SECRET = `${SEGREDO}-outro`;
    expect(lerSessao(valor)).toBeNull();
  });

  it('sem segredo, ou com um curto, ninguem entra', () => {
    const { valor } = novaSessao(ANA);
    process.env.SESSION_SECRET = 'curto-demais';
    expect(protegida()).toBe(false);
    expect(lerSessao(valor)).toBeNull();
    expect(() => novaSessao(ANA)).toThrow();
    delete process.env.SESSION_SECRET;
    expect(protegida()).toBe(false);
  });

  it('12 horas por omissao, 30 dias com "manter neste aparelho"', () => {
    const agora = Date.now();
    const curta = novaSessao(ANA, agora);
    expect(curta.expiraEm.getTime()).toBe(agora + DURACAO_CURTA_MS);
    expect(lerSessao(curta.valor, agora + 13 * 3_600_000)).toBeNull();
    const longa = novaSessao(ANA, agora, DURACAO_LONGA_MS);
    expect(lerSessao(longa.valor, agora + 29 * 86_400_000)).not.toBeNull();
  });

  it('o segredo gerado e longo e aleatorio', () => {
    const a = novoSegredo();
    expect(a.length).toBeGreaterThanOrEqual(SEGREDO_MINIMO);
    expect(a).not.toBe(novoSegredo());
  });

  it('recusa perfis desconhecidos mesmo bem assinados', () => {
    // Um cookie assinado por uma versao futura com um perfil que esta nao conhece.
    const { valor } = novaSessao({ ...ANA, perfil: 'ADMIN' as never });
    expect(lerSessao(valor)).toBeNull();
  });
});

describe('hash das palavras-passe', () => {
  it('confere a certa e recusa a errada', async () => {
    const h = await hashPalavraPasse('bolo de cenoura com 3 ovos');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await confereHash('bolo de cenoura com 3 ovos', h)).toBe(true);
    expect(await confereHash('bolo de cenoura com 4 ovos', h)).toBe(false);
  });

  it('cada hash tem o seu sal: a mesma palavra-passe da hashes diferentes', async () => {
    const a = await hashPalavraPasse('mesma-palavra-passe');
    const b = await hashPalavraPasse('mesma-palavra-passe');
    expect(a).not.toBe(b);
  });

  it('um hash estragado ou de outro formato nunca confere', async () => {
    expect(await confereHash('x', 'texto-solto')).toBe(false);
    expect(await confereHash('x', 'bcrypt$1$2$3$4$5')).toBe(false);
    expect(await confereHash('', HASH_FALSO)).toBe(false);
  });
});

describe('regras de contas', () => {
  it('palavra-passe nova', () => {
    expect(problemaNaPalavraPasse('curta', 'ana')).toMatch(/10/);
    expect(problemaNaPalavraPasse('ana-e-a-maior-123', 'ana')).toMatch(/utilizador/);
    expect(problemaNaPalavraPasse('aaaaaaaaaaaa', 'rui')).toMatch(/mesmo caracter/);
    expect(problemaNaPalavraPasse('bolo de cenoura', 'ana')).toBeNull();
  });

  it('nome de utilizador', () => {
    expect(utilizadorValido('ana.silva')).toBe(true);
    expect(utilizadorValido('an')).toBe(false);
    expect(utilizadorValido('Ana')).toBe(false);
    expect(utilizadorValido('ana silva')).toBe(false);
    expect(utilizadorValido('.ana')).toBe(false);
  });

  it(`bloqueia a ${TENTATIVAS_MAX}.a falha seguida, e recomeca a contagem`, () => {
    const agora = Date.now();
    expect(depoisDeFalhar(0, agora)).toEqual({ failedLogins: 1, lockedUntil: null });
    const bloqueio = depoisDeFalhar(TENTATIVAS_MAX - 1, agora);
    expect(bloqueio.failedLogins).toBe(0);
    expect(bloqueio.lockedUntil!.getTime()).toBe(agora + 15 * 60 * 1000);
  });
});

describe('bloqueio por origem', () => {
  it('a origem e o IP, e o IPv6 conta pelo bloco /64', () => {
    expect(chaveDaOrigem('203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
    expect(chaveDaOrigem(null, '198.51.100.1, 10.0.0.1')).toBe('198.51.100.1');
    expect(chaveDaOrigem('2001:DB8:1:2:aaaa::1', null)).toBe('2001:db8:1:2::/64');
    expect(chaveDaOrigem('2001:db8:1:2:ffff::9', null)).toBe('2001:db8:1:2::/64');
    expect(chaveDaOrigem(null, null)).toBe('desconhecida');
  });

  it('IPv6 abreviado: o mesmo bloco, escrito de qualquer maneira', () => {
    // Abreviado no meio: os 4 primeiros grupos sao 2001:db8:0:0.
    expect(chaveDaOrigem('2001:db8::1', null)).toBe('2001:db8:0:0::/64');
    expect(chaveDaOrigem('2001:0db8:0000:0000:0000:0000:0000:0007', null)).toBe('2001:db8:0:0::/64');
    expect(chaveDaOrigem('::1', null)).toBe('0:0:0:0::/64');
    expect(chaveDaOrigem('fe80::1%eth0', null)).toBe('fe80:0:0:0::/64');
    // IPv4 escrito em IPv6 e o IPv4.
    expect(chaveDaOrigem('::ffff:203.0.113.7', null)).toBe('203.0.113.7');
    // Lixo fica como veio (conta como uma origem, nao rebenta).
    expect(chaveDaOrigem('nao:e:um::ip::', null)).toBe('nao:e:um::ip::');
  });

  it(`bloqueia a ${ORIGEM_FALHAS_MAX}.a falha dentro da janela`, () => {
    const agora = Date.now();
    let e: { failures: number; windowStart: Date } | null = null;
    for (let i = 1; i < ORIGEM_FALHAS_MAX; i++) {
      const r = origemDepoisDeFalhar(e, agora);
      expect(r.lockedUntil).toBeNull();
      e = r;
    }
    const ultima = origemDepoisDeFalhar(e, agora);
    expect(ultima.lockedUntil!.getTime()).toBe(agora + ORIGEM_BLOQUEIO_MS);
  });

  it('fora da janela, a contagem recomeca', () => {
    const agora = Date.now();
    const velho = { failures: ORIGEM_FALHAS_MAX - 1, windowStart: new Date(agora - 16 * 60_000) };
    expect(origemDepoisDeFalhar(velho, agora)).toMatchObject({ failures: 1, lockedUntil: null });
  });
});

describe('o "de" da pagina de entrada', () => {
  it('aceita caminhos deste sitio, com busca', () => {
    expect(destinoInterno('/receitas')).toBe('/receitas');
    expect(destinoInterno('/encomendas/abc?v=2#x')).toBe('/encomendas/abc?v=2#x');
  });

  it('recusa tudo o que o browser levaria para outro sitio', () => {
    for (const mau of [
      'https://outro.com',
      '//outro.com',
      '/\\outro.com',
      '/\\/outro.com',
      '/\t/outro.com',
      '/\n/outro.com',
      '\\\\outro.com',
      'javascript:alert(1)',
      'outro.com',
      '',
    ]) {
      expect(destinoInterno(mau), JSON.stringify(mau)).toBeNull();
    }
  });
});

describe('onde cada perfil pode ir', () => {
  it('o dono vai a todo o lado', () => {
    for (const r of ['/', '/configuracoes', '/api/exportar/copia', '/utilizadores', '/receitas']) {
      expect(rotaPermitida('OWNER', r)).toBe(true);
    }
  });

  it('cozinha e leitura: so o livro, a conta e a ajuda', () => {
    for (const perfil of ['KITCHEN', 'READER'] as const) {
      for (const r of ['/receitas', '/receitas/abc', '/livros/x/imprimir', '/conta', '/ajuda', '/api/receitas/x/original']) {
        expect(rotaPermitida(perfil, r), `${perfil} ${r}`).toBe(true);
      }
      for (const r of [
        '/',
        '/configuracoes',
        '/precificacao/x',
        '/utilizadores',
        '/api/exportar/copia',
        '/api/fotos/x',
        '/api/saude',
        // Parecidas com as permitidas, mas nao sao.
        '/receitasx',
        '/livros-secretos',
        '/contas',
      ]) {
        expect(rotaPermitida(perfil, r), `${perfil} ${r}`).toBe(false);
      }
    }
  });

  it('a cozinha ve encomendas, producao e calendario; a leitura nao; criar encomenda so o dono', () => {
    for (const r of ['/encomendas', '/encomendas/abc', '/producao', '/producao/xyz', '/calendario']) {
      expect(rotaPermitida('KITCHEN', r), r).toBe(true);
      expect(rotaPermitida('READER', r), r).toBe(false);
    }
    expect(rotaPermitida('KITCHEN', '/encomendas/nova')).toBe(false);
    expect(rotaPermitida('KITCHEN', '/encomendasx')).toBe(false);
    expect(rotaPermitida('KITCHEN', '/clientes')).toBe(false);
    expect(rotaPermitida('KITCHEN', '/compras')).toBe(false);
  });

  it('cada perfil entra no seu sitio', () => {
    expect(inicioDoPerfil('OWNER')).toBe('/');
    expect(inicioDoPerfil('KITCHEN')).toBe('/encomendas');
    expect(inicioDoPerfil('READER')).toBe('/receitas');
  });
});
