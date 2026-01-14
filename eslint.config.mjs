// eslint.config.mjs
import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import typescriptEslint from 'typescript-eslint'

import noSelectAllWithoutArgs from './tests/no-select-all.mjs'
import noBareRouteStrings from './tests/no-bare-route-strings.mjs'

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
            'CHANGELOG.md',
            'src/styles/generated/',
            'test-results/**',
            'tests/coverage/**',
        ],
    },
    // Base JavaScript recommended rules
    js.configs.recommended,
    // TypeScript recommended rules
    ...typescriptEslint.configs.recommended,
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
                },
            },
        },
        rules: {
            'custom/noSelectAllWithoutArgs': 'error',
            'custom/noBareRouteStrings': 'error',
            'no-restricted-imports': [
                'error',
                {
                    name: '@tanstack/react-query',
                    message: 'Please import tanstack from @/common instead.',
                },
            ],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { ignoreRestSiblings: true, varsIgnorePattern: '_+', argsIgnorePattern: '^_' },
            ],
            semi: ['error', 'never'],
            'import/no-duplicates': 'error',
        },
    },
]

export default eslintConfig
