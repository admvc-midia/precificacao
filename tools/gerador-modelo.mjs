/**
 * Gerador do Prisma: escreve `src/generated/modelo.ts` com as tabelas e os
 * campos do schema — o que a copia completa e o restauro precisam de saber
 * (que colunas ha, quais sao obrigatorias, que chaves estrangeiras, quais se
 * preenchem sozinhas).
 *
 * Ate ao Prisma 6 isto vinha em `Prisma.dmmf`, dentro do cliente. No 7 o
 * cliente so leva nomes e tipos; o modelo completo so chega aos geradores.
 * Corre em cada `prisma generate` (tambem no build da Vercel), por isso nunca
 * fica atrasado em relacao ao schema.
 *
 * JavaScript simples de proposito: o Prisma chama-o com `node`, sem passar
 * por TypeScript.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import helper from '@prisma/generator-helper';

const { generatorHandler } = helper;

generatorHandler({
  onManifest: () => ({
    prettyName: 'Modelo para a copia e o restauro',
    defaultOutput: '../src/generated/modelo.ts',
  }),
  onGenerate: async (options) => {
    const destino = options.generator.output?.value;
    if (!destino) throw new Error('gerador-modelo: falta o output.');
    const modelos = options.dmmf.datamodel.models.map((m) => ({
      name: m.name,
      fields: m.fields.map((f) => ({
        name: f.name,
        kind: f.kind,
        type: f.type,
        isRequired: f.isRequired,
        hasDefaultValue: f.hasDefaultValue,
        isUpdatedAt: Boolean(f.isUpdatedAt),
        relationFromFields: f.relationFromFields ?? [],
        // "autoincrement", "now", "cuid"... ou null para um valor fixo.
        defaultFn: f.default && typeof f.default === 'object' && 'name' in f.default ? f.default.name : null,
      })),
    }));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(
      destino,
      [
        '// Gerado por tools/gerador-modelo.mjs em cada `prisma generate`. Nao editar.',
        '',
        'export interface CampoDoModelo {',
        '  name: string;',
        "  kind: 'scalar' | 'enum' | 'object' | 'unsupported';",
        '  type: string;',
        '  isRequired: boolean;',
        '  hasDefaultValue: boolean;',
        '  isUpdatedAt: boolean;',
        '  relationFromFields: string[];',
        '  defaultFn: string | null;',
        '}',
        '',
        'export interface ModeloDaBase {',
        '  name: string;',
        '  fields: CampoDoModelo[];',
        '}',
        '',
        `export const MODELOS: ModeloDaBase[] = ${JSON.stringify(modelos, null, 2)};`,
        '',
      ].join('\n'),
    );
  },
});
