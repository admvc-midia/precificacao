/**
 * Configuracao da linha de comandos do Prisma (db push, migrate diff, seed).
 *
 * Desde o Prisma 7 o endereco da base sai do schema e vem para aqui, e o
 * `.env` deixou de ser lido sozinho — dai o `dotenv`. O `dotenv` nao
 * substitui o que ja estiver no ambiente: o `tools/base-de-testes.mts`
 * aponta o DATABASE_URL ao schema dos testes antes de chamar o Prisma, e
 * isso prevalece.
 *
 * O `?schema=` do DATABASE_URL continua a valer aqui (a linha de comandos
 * le-o). A aplicacao, essa, passa o schema ao adaptador em `src/lib/db.ts`.
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
