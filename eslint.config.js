import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  { ignores: ['dist', 'supabase', 'supabase/**', '**/supabase/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/components/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "VariableDeclarator[id.name='SECTIONS']",
          message: "Do not define SECTIONS locally. Import from src/constants/admin.ts"
        },
        {
          selector: "VariableDeclarator[id.name='FIELD_TYPES']",
          message: "Do not define FIELD_TYPES locally. Import from src/constants/admin.ts"
        }
      ]
    }
  }
])
