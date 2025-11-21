import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'off', // Turn off for existing codebase
      '@typescript-eslint/no-explicit-any': 'off', // Turn off for existing codebase
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      
      // General rules
      'no-console': 'off', // Allow console for server logging
      'no-undef': 'off', // Turn off since we define globals above
      'prefer-const': 'off', // Turn off for existing codebase
      'no-var': 'off', // Turn off for existing codebase
      'object-shorthand': 'off', // Turn off to avoid conflicts with existing code style
      'prefer-arrow-callback': 'off', // Turn off to avoid conflicts
      'no-unused-vars': 'off', // Use TypeScript version instead
    },
    ignores: [
      'dist/**',
      'node_modules/**',
      'test_assets/**',
      '*.js',
      'scripts/*.js',
    ],
  },
];