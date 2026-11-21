import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const web = 'apps/web/src';
const sdk = ['matrix-js-sdk', 'matrix-js-sdk/*', '@matrix-org/*'];
const features = ['**/features/*/**', '!**/features/index'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'dev/data/**', '.claude/**'] },
  ...tseslint.configs.recommended,
  {
    files: [`${web}/**/*.{ts,tsx}`],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': ['error', {
        patterns: [{ group: sdk, message: 'Only matrix/ may import the Matrix SDK (D-03).' }],
      }],
    },
  },
  {
    files: [`${web}/app/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: sdk, message: 'Only matrix/ may import the Matrix SDK (D-03).' },
          { group: features, message: 'app/ reaches features only through the registry (D-04).' },
        ],
      }],
    },
  },
  {
    files: ['dev/**/*.ts', 'services/*/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: [`${web}/**/*.{ts,tsx}`],
    ignores: [`${web}/platform/**`],
    rules: {
      'no-restricted-globals': ['error', { name: 'Notification', message: 'Use platform from platform/ (D-08).' }],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'Notification', message: 'Use platform from platform/ (D-08).' },
        ...['storage', 'setAppBadge', 'clearAppBadge'].map((property) => ({ object: 'navigator', property, message: 'Use platform from platform/ (D-08).' })),
      ],
    },
  },
  {
    files: [`${web}/**/*.tsx`],
    ignores: [`${web}/**/*.test.tsx`, `${web}/**/dev/**`, `${web}/**/gallery/**`, `${web}/**/*[Gg]allery*`],
    rules: {
      'no-restricted-syntax': ['error',
        ...['JSXText[value=/\\S/]', ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=/\\S/]'].map((selector) => ({
          selector, message: 'No literal UI text in JSX; use a locale key (D-09).',
        })),
        ...['Literal[value=/\\S/]', 'JSXExpressionContainer > Literal[value=/\\S/]', 'JSXExpressionContainer > TemplateLiteral:has(TemplateElement[value.raw=/\\S/])'].map((value) => ({
          selector: `JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > ${value}`,
          message: 'No literal UI text in aria-label/title/placeholder/alt; use a locale key (D-09).',
        })),
      ],
    },
  },
  {
    files: [`${web}/matrix/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: [`${web}/ui/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: [...sdk, '**/matrix/**', '**/app/**', '**/features/**'], message: 'ui/ has no Matrix, app or feature imports.' }],
      }],
    },
  },
);
