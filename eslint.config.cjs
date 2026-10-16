const tseslint = require('typescript-eslint');
module.exports = tseslint.config(
  { ignores: ['.webpack/**', 'out/**', 'node_modules/**', 'ui-dist/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
