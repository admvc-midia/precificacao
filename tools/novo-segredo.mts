/**
 * Gera um valor para a SESSION_SECRET.
 *
 *   npx tsx tools/novo-segredo.mts
 *
 * Escreve so no ecra — copiar para o .env e para as variaveis da Vercel. Um
 * segredo novo faz sair toda a gente (as sessoes antigas deixam de bater).
 */

import { novoSegredo } from '../src/lib/auth';

console.log(novoSegredo());
