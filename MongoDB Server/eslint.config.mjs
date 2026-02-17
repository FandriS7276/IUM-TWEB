import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,           // base recommended rules

  {
    languageOptions: {
      globals: {
        ...globals.node,            // adds process, __dirname, __filename, etc.
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
      ecmaVersion: 2022,            // modern but still compatible
      sourceType: 'commonjs',       // ← THIS IS THE KEY LINE
    },

    rules: {
      'no-unused-vars': 'warn',     // downgrade from error → less annoying
      'no-console': 'off',          // allow console.log in backend
      'no-undef': 'error',          // keep it strict
    },
  },

  // Optional: ignore patterns (add folders/files you don't want linted)
  {
    ignores: ['node_modules/**', 'public/**'],
  },
];