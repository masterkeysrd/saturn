import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'gen']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-alert': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="progress"]',
          message:
            'Do not use native <progress>; use a styled rounded-full bg-secondary progress track with role="progressbar" and ARIA range attributes (see docs/design-system/web.md).',
        },
      ],
    },
  },
])
