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
import noRawStyleValues from './tests/no-raw-style-values.mjs'

// Shared with the database-handle object below: a later object setting this rule replaces the list.
const restrictedImportPaths = [
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
]

const serverBoundaryZone = {
    target: './src/server',
    from: ['./src/app', './src/components'],
    message: 'Server code must not import from src/app or src/components. Move shared logic to src/lib or src/schema.',
}

const indexOnlyZone = (folder) => ({
    target: ['./src', './tests', './bin'],
    from: `./src/server/${folder}`,
    except: ['./index.ts'],
    message: `Import @/server/${folder} (its index.ts), never an inner module: test mocks target the index.`,
})
const awsIndexZone = indexOnlyZone('aws')
const queriesIndexZone = indexOnlyZone('db/queries')

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
            '.ladle/dist-standalone/**',
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
    // A later object that sets this rule replaces the earlier zones for its files, so each object
    // lists every zone that applies there. Inside each folder, siblings may import each other.
    {
        files: ['**/*.{ts,tsx,mjs}'],
        rules: {
            'import/no-restricted-paths': ['error', { zones: [serverBoundaryZone, awsIndexZone, queriesIndexZone] }],
        },
    },
    {
        files: ['src/server/aws/**'],
        rules: { 'import/no-restricted-paths': ['error', { zones: [serverBoundaryZone, queriesIndexZone] }] },
    },
    {
        files: ['src/server/db/queries/**'],
        rules: { 'import/no-restricted-paths': ['error', { zones: [serverBoundaryZone, awsIndexZone] }] },
    },
    // Custom rules and project-specific configuration
    {
        plugins: {
            custom: {
                rules: {
                    noSelectAllWithoutArgs,
                    noBareRouteStrings,
                    noInvalidButtonVariant,
                    noRawStyleValues,
                },
            },
        },
        rules: {
            'custom/noSelectAllWithoutArgs': 'error',
            'custom/noBareRouteStrings': 'error',
            'custom/noInvalidButtonVariant': 'error',
            'no-restricted-imports': ['error', ...restrictedImportPaths],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { ignoreRestSiblings: true, varsIgnorePattern: '^_+$', argsIgnorePattern: '^_' },
            ],
            semi: ['error', 'never'],
            'import/no-duplicates': 'error',
        },
    },
    // One way to get a database handle: currentDb() or a required executor. Only the two files
    // that bind the root connection may import the global db, and only withTransaction() may call
    // .transaction().
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/**/*.test.{ts,tsx}', 'src/server/request-context.ts', 'src/server/actions/action.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: restrictedImportPaths,
                    patterns: [
                        {
                            // The alias and any relative path to src/database.ts.
                            regex: '^(@|\\.\\.?)(/.*)?/database$',
                            importNames: ['db'],
                            message: 'Use currentDb() from @/server/request-context, or take a required executor.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/**/*.test.{ts,tsx}', 'src/server/request-context.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'CallExpression[callee.property.name=/^(transaction|startTransaction)$/], ' +
                        'CallExpression[callee.property.value=/^(transaction|startTransaction)$/]',
                    message: 'Open transactions with withTransaction() from @/server/request-context.',
                },
            ],
        },
    },
    // Theme tokens over ad-hoc styling.
    {
        // `.ts` too: the status pills and app-shell backgrounds are plain colour constants, and a
        // .tsx-only glob never sees them.
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/**/*.stories.tsx', 'src/**/*.test.{ts,tsx}'],
        rules: {
            'custom/noRawStyleValues': 'error',
        },
    },
    // The theme is where raw values are supposed to live: it is what the tokens resolve to.
    {
        files: ['src/theme.ts', 'src/theme/**/*.ts'],
        rules: {
            'custom/noRawStyleValues': 'off',
        },
    },
    // Brand artwork is not themeable: the logo hexes are the mark itself.
    {
        files: ['src/components/layout/svg/**'],
        rules: {
            'custom/noRawStyleValues': 'off',
        },
    },
]

export default eslintConfig
