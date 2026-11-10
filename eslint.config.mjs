import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'graphify-out/**', 'mockups/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // Express error handlers need an unused 4th arg; prefix unused params with _
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['apps/api/**/*.{ts,mjs}'], languageOptions: { globals: globals.node } },
  {
    files: ['apps/{pos,backoffice}/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
