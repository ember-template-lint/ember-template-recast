module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module',
  },
  plugins: ['prettier', 'node'],
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  env: {
    node: true,
  },
  rules: {
    // these are disabled because the import statements have to use `.js` extension,
    // but eslint-plugin-node can only see `.ts` files (so it flags them as missing)
    'node/no-missing-import': 'off',
    'node/no-unpublished-import': 'off',

    'node/no-unsupported-features/es-syntax': ['error', { ignores: ['dynamicImport', 'modules'] }],
    'prettier/prettier': 'error',
  },

  overrides: [
    {
      files: ['**/*.ts'],

      parser: '@typescript-eslint/parser',

      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      settings: {
        node: {
          tryExtensions: ['.js', '.json', '.d.ts', '.ts'],

          convertPath: [
            {
              include: ['src/**/*.ts'],
              replace: ['^src/(.+)\\.ts$', 'lib/$1.js'],
            },
          ],
        },
      },

      rules: {
        // we should work to remove these overrides
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        'prefer-const': 'off',
      },
    },
    {
      files: ['__tests__/**', '**/*.test.ts'],

      env: {
        jest: true,
      },
    },
  ],
};
