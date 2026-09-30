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
 *
 * As fotos dos produtos vao para `<pasta>/fotos/`. O JSON so tem o caminho
 * delas no Blob; sem as descarregar, perder o Blob era perder as fotos. Cada
 * foto nova tem um caminho novo, por isso so se descarregam as que faltam.
 * Fotos antigas (trocadas ou removidas) ficam na pasta: sao poucas e pequenas.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { prisma } from '../src/lib/db';
import { copiaCompleta, copiaEmJson } from '../src/lib/exportar/gerar';
import { nomeDoFicheiro } from '../src/lib/exportar/listas';
import { blobConfigurado, lerFoto } from '../src/lib/fotos';

// A tarefa agendada corre isto fora do Next, que e quem costuma ler o .env.
// O Prisma le o DATABASE_URL sozinho; o token do Blob nao. Nao substitui o que
// ja estiver definido no ambiente. Vem depois dos imports (que correm sempre
// primeiro) e chega a tempo: o token so e lido quando se pede uma foto.
try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env (na Vercel, por exemplo): fica o que o ambiente tiver.
}

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

  // Fotos: so as que ainda nao estao na pasta. Uma que falhe nao estraga a
  // copia — fica para a proxima semana, e o registo diz qual foi.
  const caminhos = (
    copia.tabelas.Recipe as { photoPath?: string | null; photoThumbPath?: string | null }[]
  ).flatMap((r) => [r.photoPath, r.photoThumbPath]).filter((c): c is string => Boolean(c));
  if (caminhos.length > 0) {
    if (!blobConfigurado()) {
      console.warn(`${caminhos.length} foto(s) por copiar: falta BLOB_READ_WRITE_TOKEN no .env.`);
    } else {
      const pastaFotos = join(destino, 'fotos');
      mkdirSync(pastaFotos, { recursive: true });
      let novas = 0;
      for (const c of caminhos) {
        const alvo = join(pastaFotos, basename(c));
        if (existsSync(alvo)) continue;
        try {
          const foto = await lerFoto(c);
          if (!foto) throw new Error('nao existe no Blob');
          writeFileSync(alvo, Buffer.from(await new Response(foto.stream).arrayBuffer()));
          novas++;
        } catch (err) {
          console.warn(`Foto ${c} nao copiada:`, err instanceof Error ? err.message : err);
        }
      }
      console.log(`Fotos: ${novas} nova(s), ${caminhos.length} no total.`);
    }
  }

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
