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
// Primeiro de tudo: o cliente do Prisma 7 le o DATABASE_URL quando e criado
// (ao importar `lib/db`), e a tarefa agendada corre isto fora do Next. Nao
// substitui o que ja estiver definido no ambiente.
import 'dotenv/config';

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { prisma } from '../src/lib/db';
import { copiaCompleta, copiaEmJson } from '../src/lib/exportar/gerar';
import { nomeDoFicheiro } from '../src/lib/exportar/listas';
import { blobConfigurado, lerFoto } from '../src/lib/fotos';
import { apagarOriginal, lerOriginal, listarOriginais, orfaos } from '../src/lib/livro/ficheiros';

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
  // As das fichas e as das receitas do livro.
  const comFoto = [
    ...(copia.tabelas.Recipe as { photoPath?: string | null; photoThumbPath?: string | null }[]),
    ...(copia.tabelas.BookRecipe as { photoPath?: string | null; photoThumbPath?: string | null }[]),
  ];
  const caminhos = comFoto
    .flatMap((r) => [r.photoPath, r.photoThumbPath])
    .filter((c): c is string => Boolean(c));
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

  // PDFs originais do livro de receitas: copiam-se como as fotos, e os
  // esquecidos (importacoes abandonadas ha mais de um dia) apagam-se do Blob.
  // Uma falha aqui nao estraga a copia, que ja esta gravada.
  if (blobConfigurado()) {
    try {
      const usados = new Set(
        (copia.tabelas.BookRecipe as { sourceFilePath?: string | null }[])
          .map((r) => r.sourceFilePath)
          .filter((c): c is string => Boolean(c)),
      );
      const pastaOriginais = join(destino, 'originais');
      mkdirSync(pastaOriginais, { recursive: true });
      let novos = 0;
      for (const c of usados) {
        const alvo = join(pastaOriginais, basename(c));
        if (existsSync(alvo)) continue;
        const f = await lerOriginal(c);
        if (!f) {
          console.warn(`Original ${c} nao existe no Blob.`);
          continue;
        }
        writeFileSync(alvo, Buffer.from(await new Response(f.stream).arrayBuffer()));
        novos++;
      }
      const esquecidos = orfaos(await listarOriginais(), usados);
      for (const c of esquecidos) await apagarOriginal(c);
      console.log(`Originais: ${novos} novo(s), ${usados.size} no total; ${esquecidos.length} esquecido(s) apagado(s).`);
    } catch (err) {
      console.warn('Originais nao tratados:', err instanceof Error ? err.message : err);
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
