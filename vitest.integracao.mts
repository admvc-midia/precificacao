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
    // Pela ordem: primeiro a ligacao vai para o schema dos testes (antes de
    // qualquer import do Prisma); depois a sessao de dono falsa, porque sem
    // pedido nao ha cookie.
    setupFiles: ['tests/integracao/base-de-testes.ts', 'tests/integracao/sessao-falsa.ts'],
    // As chamadas a base sao lentas em comparacao com o resto.
    testTimeout: 30_000,
    // A preparacao (retrato + limpeza) faz uma ida a base por tabela, e sao
    // cada vez mais tabelas; 30 s ja nao chegavam numa ligacao lenta.
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
