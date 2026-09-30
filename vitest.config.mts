import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Os de integracao precisam de Postgres e tem config propria
    // (`vitest.integracao.mts`, via `npm run test:db`). Esta suite tem de
    // poder correr sem base nenhuma — e o que o CI faz.
    exclude: ['tests/integracao/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
