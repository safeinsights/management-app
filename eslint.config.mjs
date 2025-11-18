import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import globals from 'globals'
import noSelectAllWithoutArgs from './tests/no-select-all.mjs'
import noBareRouteStrings from './tests/no-bare-route-strings.mjs'

const eslintConfig = [

    // Base recommended configs
    js.configs.recommended,

    // Global ignores
    {
        ignores: ['node_modules', '.next', 'out', 'build', 'next-env.d.ts', 'dist/', 'next-env.d.ts', '.*', 'CHANGELOG.md', 'src/styles/generated/', 'test-results', 'tests/coverage'],
    },

    // custom plugins
     {
         files: ['**/*.{js,jsx,ts,tsx}'],
         plugins: {
             custom: {
                 rules: {
                     noSelectAllWithoutArgs,
                     noBareRouteStrings,
                 },
             },
        },
     },
    
    // React plugin configuration
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            react: reactPlugin,
        },
        rules: {
            ...reactPlugin.configs['jsx-runtime'].rules,
            // React specific rules (preserve existing overrides)
            'react/react-in-jsx-scope': 'off', // Not needed in Next.js
            'react/prop-types': 'off', // Using TypeScript for prop validation
            'react/jsx-uses-react': 'off', // Not needed in Next.js
            'react/jsx-uses-vars': 'error',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },

    // React Hooks plugin configuration
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            'react-hooks': reactHooksPlugin,
        },
        rules: reactHooksPlugin.configs.recommended.rules,
    },

    // JSX Accessibility plugin configuration
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            'jsx-a11y': jsxA11y,
        },
        rules: jsxA11y.configs.recommended.rules,
    },

    // Next.js plugin configuration
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
        },
    },

    // TypeScript plugin configuration
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.es2020,
                ...globals.node,
                React: 'readonly',
                JSX: 'readonly',
                // Custom global types from globals.d.ts
                UserInfo: 'readonly',
                UserOrgMembershipInfo: 'readonly',
                UserOrgMembershipInfoV1: 'readonly',
                UserPublicMetadata: 'readonly',
                UserPreferences: 'readonly',
                UserUnsafeMetadata: 'readonly',
                UserSession: 'readonly',
                CustomJwtSessionClaims: 'readonly',
                // Node.js types
                NodeJS: 'readonly',
                // Web API types
                BlobPart: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            // TypeScript specific rules (preserve existing overrides)
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            // Use TypeScript-aware version for function overloads
            'no-redeclare': 'off',
            '@typescript-eslint/no-redeclare': 'error',
        },
    },

    // Main configuration for all JS/TS files (complexity and general rules)
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.es2020,
                ...globals.node,
            },
        },
        rules: {
            // Code complexity rules (ADR-027)
            complexity: ['error', { max: 15 }], // Cyclomatic complexity limit
            'max-depth': ['error', { max: 4 }], // Nesting depth limit
            'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
            'max-params': ['warn', { max: 4 }], // Function parameter limit
            'max-statements': ['warn', { max: 30 }], // Statement count per function

            // General rules
            'no-console': 'warn',
            'no-debugger': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },

    // Configuration for test files - exempt from function length limits
    {
        files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.jest,
                jest: 'readonly',
            },
        },
        rules: {
            'max-lines-per-function': 'off', // Test files often have long test suites
            'max-statements': 'off', // Test assertions can be numerous
            'no-empty-pattern': 'off', // Common in Playwright destructuring
            'no-console': 'off', // Allow console in tests
        },
    },

    // Configuration for debug/bin files
    {
        files: ['bin/**/*.{ts,tsx}'],
        rules: {
            'no-console': 'off', // Allow console in CLI tools
        },
    },

    // Configuration for config files
    {
        files: ['jest.config.js', 'jest.setup.js', 'next.config.js', 'sentry.*.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'import/namespace': 'off', // Not using eslint-plugin-import
        },
    },
]

export default eslintConfig
