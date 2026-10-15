import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist',
      'dist-portal',
      'release',
      'coverage',
      'playwright-report',
      'test-results',
      '.wrangler',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.worker.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      eqeqeq: 'error',
    },
  },
  {
    // Two products share this repo (CLAUDE.md): germle.com code must never pull in Germle Endless.
    files: ['src/**/*.ts', 'worker/**/*.ts'],
    ignores: ['src/portal/**', 'src/endless/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/portal', '**/portal/**', '**/endless', '**/endless/**'],
              message:
                'germle.com code must not import Germle Endless (portal) code; see CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // The run logic stays pure (no DOM, no platform), so the simulator and tests can run it.
    files: ['src/endless/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/portal', '**/portal/**', '**/ui/**'],
              message: 'src/endless is pure run logic; UI and platform code live in src/portal.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
