module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'script'
  },
  plugins: [
    'prettier',
    'node',
  ],
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'prettier',
  ],
  env: {
    node: true
  },
  rules: {
    'prettier/prettier': 'error',
  },

  overrides: [
    {
      files: ['tests/**'],

      env: {
        qunit: true
      }
    }
  ]
};
