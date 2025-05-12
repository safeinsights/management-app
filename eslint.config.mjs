// eslint.config.mjs
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
    // import.meta.dirname is available after Node.js v20.11.0
    baseDirectory: import.meta.dirname,
})

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
    {
        ignores: ['src/styles/generated/'],
    },
    ...compat.extends('next/core-web-vitals'),
    ...compat.extends('next/typescript'),
    {
        rules: {
            'no-console': ['error', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { ignoreRestSiblings: true, varsIgnorePattern: '_+', argsIgnorePattern: '^_' },
            ],
            semi: ['error', 'never'],
        },
    },
]

export default eslintConfig
