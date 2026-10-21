// @ts-check
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.expo/**',
  '**/coverage/**',
  'apps/mobile/android/**',
  'apps/mobile/ios/**',
  'pipeline/**',
  'contracts/schema/**',
  'supabase/functions/_shared/riftbuild-shared/**',
  '**/*.config.js',
  'apps/mobile/src/theme/colors.js',
];

export default tseslint.config(
  { ignores },
  // App: Expo's recommended rules.
  ...expoConfig.map((c) => ({ ...c, files: c.files ?? ['apps/mobile/**/*.{ts,tsx,js,jsx}'] })),
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  // Shared / evals / Deno: plain TypeScript.
  {
    files: ['packages/**/*.ts', 'evals/**/*.ts', 'supabase/functions/**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  // zod idiom: `export const X = z.object(...)` + `export type X = z.infer<typeof X>`.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
  // packages/shared must stay runtime-agnostic: it runs in React Native, Node (Vitest) and Deno.
  {
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'require',
        '__dirname',
        'Deno',
        'window',
        'document',
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'shared must not depend on Node built-ins.',
            },
            {
              group: ['react', 'react-native', 'expo*', '@expo/*'],
              message: 'shared must not depend on React/Expo.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
