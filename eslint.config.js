// ESLint flat config. It enforces the CLAUDE.md rules that a tool can check; see docs/architecture.md.
import angular from 'angular-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Syntax CLAUDE.md forbids in TypeScript: `enum`, `namespace` and the `as unknown as` escape hatch. */
const forbiddenSyntax = [
  {
    selector: 'TSEnumDeclaration',
    message: 'No enum: use an `as const` array and a union type.',
  },
  {
    selector: "TSModuleDeclaration[kind='namespace']",
    message: 'No namespace: use ES modules.',
  },
  {
    selector: "TSModuleDeclaration[kind='module'][id.type='Identifier']",
    message: 'No internal module: use ES modules.',
  },
  {
    selector:
      "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
    message:
      'No `as unknown as`: validate the value with a type guard instead.',
  },
];

export default defineConfig(
  globalIgnores([
    'dist/',
    'out-tsc/',
    'coverage/',
    '.angular/',
    'docs/design/',
    'src/app/core/api/schema.d.ts',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
      // Angular components and directives may be empty classes; the decorator is their content.
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowWithDecorator: true },
      ],
      'no-restricted-syntax': ['error', ...forbiddenSyntax],
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'ah', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'ah', style: 'camelCase' },
      ],
      // OnPush is Angular 22's default; this forbids opting out of it.
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },
  {
    // Tests may use `!` freely (CLAUDE.md).
    files: ['**/*.spec.ts', 'src/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
    },
  },
  {
    // Tool configuration files must default-export their config.
    files: ['eslint.config.js', 'proxy.conf.mjs', '*.config.{js,mjs,ts}'],
    rules: {
      'no-restricted-exports': 'off',
    },
  }
);
