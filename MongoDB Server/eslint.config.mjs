import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,

  {
    files: ['**/*.js'],  // apply to all .js files
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',  // ← this line MUST be here for ALL files
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',     // downgrade from error → less annoying
      'no-console': 'off',          // allow console.log in backend
      'no-undef': 'error'          // keep it strict
    }
  },

  // Optional: ignore patterns (add folders/files you don't want linted)
  {
    ignores: ['node_modules/**', 'public/**']
  }
];