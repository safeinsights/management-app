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
            // Ban HTML character entities in JSX text. Our production compiler (SWC)
            // drops the space between an inline element and adjacent JSX text when that
            // text contains an entity (swc#11392) — invisible in unit tests (Babel),
            // broken in prod. Use the literal character instead (e.g. ’ ” &).
            // Remove this rule once @next/swc ships the fix; see
            // src/lib/swc-jsx-entity-whitespace.test.ts.
            // NOTE: extend this array to add more restricted-syntax patterns — do NOT add a
            // second 'no-restricted-syntax' key in this block, it would silently overwrite
            // these selectors (object-key collision) and disable the entity guard with no error.
            'no-restricted-syntax': [
                'error',
                {
                    // typescript-eslint exposes the source text (with entities) on `raw`;
                    // `value` is already entity-decoded, so it must be `raw` here.
                    selector: 'JSXText[raw=/&\\w+;/]',
                    message:
                        'Do not use HTML character entities (e.g. &apos;, &rsquo;, &amp;) in JSX text — they trigger an SWC whitespace bug (swc#11392). Use the literal character instead (e.g. ’ ” &).',
                },
                {
                    // Numeric refs need their own selector because the named pattern above stops at
                    // `#` (not a `\w`). `&#\w+;` covers both decimal (&#39;) and hex (&#x27;) forms.
                    selector: 'JSXText[raw=/&#\\w+;/]',
                    message:
                        'Do not use numeric HTML character references (e.g. &#39;) in JSX text — they trigger an SWC whitespace bug (swc#11392). Use the literal character instead.',
                },
            ],
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
                { ignoreRestSiblings: true, varsIgnorePattern: '^_+$', argsIgnorePattern: '^_' },
            ],
            semi: ['error', 'never'],
            'import/no-duplicates': 'error',
        },
    },
]

export default eslintConfig
