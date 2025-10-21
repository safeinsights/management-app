// eslint.config.mjs
import { FlatCompat } from '@eslint/eslintrc'

import noSelectAllWithoutArgs from './tests/no-select-all.mjs'

const compat = new FlatCompat({
    // import.meta.dirname is available after Node.js v20.11.0
    baseDirectory: import.meta.dirname,
})

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
    {
        ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
    },
    {
        ignores: ['.*', 'CHANGELOG.md', 'src/styles/generated/', 'test-results/**', 'tests/coverage/**'],
    },
    ...compat.extends('next/core-web-vitals'),
    ...compat.extends('next/typescript'),
    ...compat.extends('plugin:import/recommended'),
    ...compat.extends('plugin:import/typescript'),
    {
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
        plugins: {
            custom: {
                rules: {
                    noSelectAllWithoutArgs,
                },
            },
        },
        rules: {
            'custom/noSelectAllWithoutArgs': 'error',
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
