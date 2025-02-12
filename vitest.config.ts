import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'

const IS_CI = !!process.env.CI

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        mockReset: true,
        reporters: [IS_CI ? 'github-actions' : 'verbose'],
        environment: 'happy-dom',
        setupFiles: ['tests/vitest.setup.ts'],
        include: ['src/**/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: IS_CI,
            reportsDirectory: 'tmp/code-coverage/unit',
            clean: true,
            coverageReportOptions: {
                reports: ['raw', 'console-details', 'v8', 'html'],
                lcov: true,
                outputDir: 'tmp/code-coverage/unit',
                clean: true,
                sourceFilter: testsCoverageSourceFilter,
            },
            provider: 'custom',
            customProviderModule: 'vitest-monocart-coverage',
        } as any, // eslint-disable-line
        // ↑ is needed because the monocart-coverage uses non-typed coverageReportOptions
    },
})
