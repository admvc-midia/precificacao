/**
 * Copia de seguranca: grava a copia completa (a mesma do botao em Exportar
 * dados) numa pasta, e apaga as mais antigas.
 *
 *   npx tsx prisma/copia-seguranca.mts <pasta> [quantas-guardar]
 *
 * Corre sozinha pela tarefa agendada do Windows (ver
 * `tools/agendar-copia.ps1`). So le a base — nunca escreve nela.
 *
 * Guarda as ultimas 12 por omissao: com uma por semana, sao tres meses. So
 * apaga ficheiros com o nome que ela propria da, nunca outra coisa da pasta.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { prisma } from '../src/lib/db';
import { copiaCompleta, copiaEmJson } from '../src/lib/exportar/gerar';
import { nomeDoFicheiro } from '../src/lib/exportar/listas';

const pasta = process.argv[2];
const guardar = Number(process.argv[3] ?? 12);
if (!pasta || !Number.isInteger(guardar) || guardar < 1) {
  console.error('Uso: npx tsx prisma/copia-seguranca.mts <pasta> [quantas-guardar]');
  process.exit(2);
}

const destino = resolve(pasta);
mkdirSync(destino, { recursive: true });

try {
  const copia = await copiaCompleta();
  const total = Object.values(copia.contagem).reduce((a, b) => a + b, 0);
  // Uma copia sem nada quase de certeza e uma ligacao a base errada (outro
  // schema, base nova). Nao a guardar evita que empurre uma boa para fora.
  if (total === 0) throw new Error('A base veio vazia — nada gravado.');

  const ficheiro = join(destino, nomeDoFicheiro('copia-completa', 'json'));
  writeFileSync(ficheiro, copiaEmJson(copia), 'utf8');
  console.log(`Gravado ${ficheiro}`);
  console.log(
    Object.entries(copia.contagem)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
  );

  // O nome leva a data em AAAA-MM-DD, por isso a ordem alfabetica e a
  // cronologica. Duas no mesmo dia: a segunda substitui a primeira.
  const minhas = readdirSync(destino)
    .filter((f) => /^precificacao-copia-completa-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const velha of minhas.slice(0, Math.max(0, minhas.length - guardar))) {
    rmSync(join(destino, velha));
    console.log(`Apagada a antiga ${velha}`);
  }
} catch (err) {
  console.error('Copia falhou:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
