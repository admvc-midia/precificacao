/**
 * Primeiro ficheiro de preparacao dos testes de integracao: aponta a ligacao
 * ao schema dos testes ANTES de qualquer teste importar o Prisma, e garante
 * o minimo que a app espera la dentro (a configuracao e um canal de balcao).
 *
 * O schema cria-se com `npm run test:db:preparar` (ver `tools/base-de-testes.mts`).
 */

import { existsSync } from 'node:fs';

import { urlDeTestes } from './url-de-testes';

if (existsSync('.env')) process.loadEnvFile('.env');
const original = process.env.DATABASE_URL ?? '';
// Ja trocada (numa segunda passagem do mesmo processo): nao trocar de novo.
if (!original.includes('schema=precificaragao_teste')) {
  process.env.DATABASE_URL = urlDeTestes(original);
}
// As sessoes precisam de um segredo; nos testes, um fixo basta.
process.env.SESSION_SECRET ??= 'segredo-dos-testes-de-integracao-com-mais-de-32-caracteres';

const { prisma } = await import('@/lib/db');
await prisma.settings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
if ((await prisma.salesChannel.count({ where: { kind: 'COUNTER' } })) === 0) {
  await prisma.salesChannel.create({ data: { name: 'Balcao', kind: 'COUNTER' } });
}
