// eslint.config.mjs
import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import antiTrojanSource from 'eslint-plugin-anti-trojan-source'
import typescriptEslint from 'typescript-eslint'

import noSelectAllWithoutArgs from './tests/no-select-all.mjs'
import noBareRouteStrings from './tests/no-bare-route-strings.mjs'
import noInvalidButtonVariant from './tests/no-invalid-button-variant.mjs'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
    // Global ignores
    {
        ignores: [
            'node_modules/**',
            '.next/**',
            'out/**',
            'build/**',
            'next-env.d.ts',
            '.*',
            // Lint the .ladle/ source (shims, provider, config) but not its build output.
            '!.ladle',
            '!.ladle/**',
            '.ladle/dist/**',
            'CHANGELOG.md',
            'test-results/**',
            'tests/coverage/**',
            'services/**',
        ],
    },
    // Base JavaScript recommended rules
    js.configs.recommended,
    // TypeScript recommended rules
    ...typescriptEslint.configs.recommended,
    {
        plugins: { 'anti-trojan-source': antiTrojanSource },
        rules: { 'anti-trojan-source/no-bidi': 'error' },
    },
    // React plugin configuration
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...reactPlugin.configs['jsx-runtime'].rules,
            ...reactHooksPlugin.configs.recommended.rules,
            // Disable prop-types for TypeScript projects
            'react/prop-types': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    // CommonJS files configuration
    {
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                module: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                exports: 'writable',
                process: 'readonly',
            },
        },
    },
    // Next.js plugin configuration
    {
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
        },
    },
    // Import plugin configuration
    {
        plugins: {
            import: importPlugin,
        },
        rules: {
            ...importPlugin.configs.recommended.rules,
            ...importPlugin.configs.typescript.rules,
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                },
                node: {
                    extensions: ['.js', '.jsx', '.ts', '.tsx'],
                },
            },
        },
    },
    // Custom rules and project-specific configuration
    {
        plugins: {
            custom: {
                rules: {
                    noSelectAllWithoutArgs,
                    noBareRouteStrings,
                    noInvalidButtonVariant,
                },
            },
        },
        rules: {
            'custom/noSelectAllWithoutArgs': 'error',
            'custom/noBareRouteStrings': 'error',
            'custom/noInvalidButtonVariant': 'error',
            'no-restricted-imports': [
                'error',
                {
                    name: '@tanstack/react-query',
                    message: 'Please import tanstack from @/common instead.',
                },
                {
                    // It cancels the Tab keydown, which traps keyboard focus in the editor and
                    // types a literal tab (WCAG 2.1.2). Lexical's own docs discourage it. Twice
                    // now it has been copied into a new editor along with the rest of the plugin
                    // list, so the ban is the guard. Indent / Outdent live on the toolbar.
                    name: '@lexical/react/LexicalTabIndentationPlugin',
                    message: 'Tab must move focus out of the editor. Use the toolbar Indent / Outdent buttons instead.',
                },
            ],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { ignoreRestSiblings: true, varsIgnorePattern: '^_+$', argsIgnorePattern: '^_' },
            ],
            semi: ['error', 'never'],
            'import/no-duplicates': 'error',
        },
    },
]

export default eslintConfig
