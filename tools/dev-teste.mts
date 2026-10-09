/**
 * A app em desenvolvimento contra o schema dos testes, `precificaragao_teste`,
 * e nao contra a base da casa:
 *
 *   npm run dev:teste
 *
 * Serve para experimentar uma mudanca de schema antes do `db push` a serio
 * (correr `npm run test:db:preparar` antes). Vazio de inicio: a primeira
 * entrada com a APP_PASSWORD cria o dono; uma copia de seguranca restaurada
 * em ⚙ → Copia de seguranca traz os dados — so aqui.
 *
 * O Next nao substitui uma variavel que ja venha do ambiente, por isso a
 * DATABASE_URL daqui ganha a do `.env`. Porta 3001, para poder correr ao lado
 * do `npm run dev` normal sem os confundir, com a pasta de build `.next-teste`
 * (o Next 16 so deixa um `next dev` por pasta de build).
 */

import { spawnSync } from 'node:child_process';

import { urlDeTestes } from '../tests/integracao/url-de-testes';

process.loadEnvFile('.env');
const url = urlDeTestes(process.env.DATABASE_URL ?? '');
console.log(`Base: schema ${new URL(url).searchParams.get('schema')} — http://localhost:3001`);

const r = spawnSync('npx', ['next', 'dev', '--webpack', '-p', '3001', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url, NEXT_DIST_DIR: '.next-teste' },
});
process.exit(r.status ?? 1);
