/**
 * Cria (ou atualiza) o schema dos testes de integracao, `precificaragao_teste`,
 * com as tabelas do schema da app.
 *
 *   npm run test:db:preparar
 *
 * Corre `prisma db push` com a DATABASE_URL do .env apontada ao schema dos
 * testes — nunca ao da app. Correr de novo depois de mudar o schema.
 */

import { spawnSync } from 'node:child_process';

import { urlDeTestes } from '../tests/integracao/url-de-testes';

process.loadEnvFile('.env');
const url = urlDeTestes(process.env.DATABASE_URL ?? '');
console.log('A preparar o schema dos testes:', new URL(url).searchParams.get('schema'));

const r = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(r.status ?? 1);
