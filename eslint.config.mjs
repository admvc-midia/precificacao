import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * O `next lint` foi removido no Next 16, por isso o ESLint corre direto e a
 * configuracao do Next importa-se como flat config — sem o adaptador
 * `FlatCompat`, que so serve para configuracoes do formato antigo.
 *
 * As regras que interessam aqui sao as do React: uma lista sem `key` ou um
 * hook mal usado nao aparecem no `tsc` e so davam sinal quando se abria a
 * pagina no browser.
 */
const config = [
  { ignores: ['.next/**', '.next-teste/**', 'node_modules/**', 'next-env.d.ts', 'src/generated/**'] },

  ...(Array.isArray(coreWebVitals) ? coreWebVitals : [coreWebVitals]),
  ...(Array.isArray(typescript) ? typescript : [typescript]),

  {
    rules: {
      // O projeto usa `any` pontualmente na fronteira com o Prisma: avisar
      // chega, falhar por isso nao.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
