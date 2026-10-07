/**
 * A rede de seguranca destes testes, testada.
 *
 * `exigirTudoComoEstava` passa em todas as corridas — o que e bom sinal e, ao
 * mesmo tempo, exatamente o que uma verificacao avariada tambem faria. Isto
 * prova que ela repara numa diferenca quando ha uma.
 *
 * So le da base. A diferenca e simulada no objecto, nao nos dados.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { exigirSchemaCerto, prisma, retrato } from './base';
import { urlDeTestes } from './url-de-testes';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('a rede de seguranca', () => {
  it('exige o schema desta aplicacao', () => {
    const real = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db?sslmode=require';
      expect(() => exigirSchemaCerto()).toThrow(/schema/i);

      // Sem `schema=` o Prisma trabalha no `public`, que aqui e de outro
      // projeto: apagar la seria estragar dados que nem sao deste produto.
      process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db?schema=public';
      expect(() => exigirSchemaCerto()).toThrow(/schema/i);

      // O schema da casa tambem nao: os testes so correm no deles.
      process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db?schema=precificaragao';
      expect(() => exigirSchemaCerto()).toThrow(/schema/i);

      process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db?schema=precificaragao_teste';
      expect(() => exigirSchemaCerto()).not.toThrow();

      // E a troca de schema nunca aponta a outro sitio que nao o dos testes.
      expect(urlDeTestes('postgresql://u:p@h:5432/db?sslmode=require&schema=precificaragao&connection_limit=5')).toBe(
        'postgresql://u:p@h:5432/db?sslmode=require&schema=precificaragao_teste&connection_limit=5',
      );
      expect(() => urlDeTestes('postgresql://u:p@h:5432/db?schema=public')).toThrow();

      delete process.env.DATABASE_URL;
      expect(() => exigirSchemaCerto()).toThrow(/DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = real;
    }
  });

  it('dois retratos seguidos sao iguais', async () => {
    expect(await retrato()).toEqual(await retrato());
  });

  it('repara numa linha a mais', async () => {
    const antes = await retrato();
    const adulterado = { ...antes, insumos: antes.insumos + 1 };
    expect(() => expect(adulterado).toEqual(antes)).toThrow();
  });

  it('repara numa configuracao mexida', async () => {
    // O caso que aconteceu a serio: os custos fixos foram a zero e mais nada
    // no ecra denunciou.
    //
    // A diferenca deriva-se do valor actual em vez de ser escrita a mao. Na
    // primeira versao deste teste estava `'0'` fixo, e ele passou a falhar
    // quando os custos fixos ficaram mesmo a zero: comparar o valor com ele
    // proprio nao acusa diferenca nenhuma. Um teste que depende do estado dos
    // dados nao testa o que diz testar.
    const antes = await retrato();
    const adulterado = {
      ...antes,
      settings: {
        ...antes.settings,
        fixedCostRate: `${antes.settings.fixedCostRate}9`,
      },
    };
    expect(() => expect(adulterado).toEqual(antes)).toThrow();
  });

  it('repara no nome da casa mexido', async () => {
    const antes = await retrato();
    const adulterado = {
      ...antes,
      settings: {
        ...antes.settings,
        businessName: `${antes.settings.businessName ?? ''}-diferente`,
      },
    };
    expect(() => expect(adulterado).toEqual(antes)).toThrow();
  });

  it('o retrato conta so o que nao tem a marca', async () => {
    // Se contasse tudo, as linhas dos proprios testes fariam a verificacao
    // falhar sozinha — e alguem acabaria por a desligar.
    const r = await retrato();
    const marcados = await prisma.ingredient.count({
      where: { name: { startsWith: 'ZZTEMP-' } },
    });
    const todos = await prisma.ingredient.count();
    expect(r.insumos).toBe(todos - marcados);
  });
});
