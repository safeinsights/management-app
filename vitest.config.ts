import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'

const IS_CI = !!process.env.CI
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    resolve: {
        alias: {
            // Force a single yjs / y-protocols module instance across the test
            // tree. Without this, `services/editor/node_modules/yjs` and the
            // root's `node_modules/yjs` load as separate module instances, and
            // anything that reads a Y.Doc (e.g. `Doc.get('root', Y.XmlText)`)
            // sees a constructor-identity mismatch and throws "Type with the
            // name root has already been defined with a different constructor."
            // Production is unaffected — services/editor and the Next app run
            // as separate processes — so this is a vitest-only resolver fix.
            yjs: path.resolve(__dirname, 'node_modules/yjs'),
            'y-protocols': path.resolve(__dirname, 'node_modules/y-protocols'),
        },
    },
    test: {
        // Prevent AWS SSO profile from overriding local S3 credentials (from .env)
        env: { AWS_PROFILE: '' },
        mockReset: true,
        reporters: IS_CI ? ['github-actions'] : ['verbose'],
        environment: 'happy-dom',
        setupFiles: ['tests/vitest.setup.ts'],
        include: ['src/**/*.(test).{js,jsx,ts,tsx}', 'services/**/*.(test).{js,jsx,ts,tsx}'],
        allowOnly: !IS_CI,
        coverage: {
            enabled: Boolean(IS_CI || process.env.COVERAGE),
            reportsDirectory: 'test-results/unit',
            clean: true,
            coverageReportOptions: {
                reports: ['raw', 'console-details', 'v8', 'html'],
                lcov: true,
                outputDir: 'test-results/unit',
                clean: true,
                filter: { '**/*.css': false, '**/*': true },
                sourceFilter: testsCoverageSourceFilter,
            },
            provider: 'custom',

            customProviderModule: 'vitest-monocart-coverage',
        } as any, // eslint-disable-line
        // ↑ is needed because the monocart-coverage uses non-typed coverageReportOptions
    },
})
