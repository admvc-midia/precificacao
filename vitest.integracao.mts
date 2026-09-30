import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Testes que falam com a base de dados.
 *
 * Config separada de proposito: `npm test` tem de poder correr sem Postgres
 * nenhum — e o que o CI faz, e o que alguem faz ao clonar o repositorio pela
 * primeira vez. Estes correm com `npm run test:db`, contra a base real, e
 * limpam o que criam. Ver `tests/integracao/base.ts`.
 *
 * Um ficheiro de cada vez: escrevem na mesma base, e dois em paralelo dariam
 * falhas que nao se reproduzem.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integracao/**/*.test.ts'],
    fileParallelism: false,
    // As chamadas a base sao lentas em comparacao com o resto.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
