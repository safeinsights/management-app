import { defineConfig, devices, type ReporterDescription } from '@playwright/test'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'
import path from 'path'

const reporters: ReporterDescription[] = []
if (process.argv.includes('--ui')) {
    reporters.push(['list'])
} else {
    reporters.push([
        'monocart-reporter',
        {
            outputFile: path.resolve('./tmp/test-results/e2e/coverage.html'),
            coverage: {
                outputDir: path.resolve('./tmp/code-coverage/e2e'),
                entryFilter: (entry: { url: string; source: string }) => {
                    return entry.url.match(/\/chunks\/src/) && !entry.source.match(/TURBOPACK_CHUNK_LISTS/)
                },
                sourceFilter: testsCoverageSourceFilter,
                reports: [
                    'raw',
                    'v8',
                    'console-summary',
                    [
                        'lcovonly',
                        {
                            file: 'lcov/code-coverage.lcov.info',
                        },
                    ],
                ],
            },
        },
    ])
}

export default defineConfig({
    testDir: './tests',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: reporters,
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://127.0.0.1:4000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'global setup',
            testMatch: /playwright\.setup\.ts/,
        },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['global setup'],
        },

        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        //     dependencies: ['global setup'],
        // },

        // {
        //     name: 'webkit',
        //     use: { ...devices['Desktop Safari'] },
        //     dependencies: ['global setup'],
        // },

        /* Test against mobile viewports. */
        // {
        //   name: 'Mobile Chrome',
        //   use: { ...devices['Pixel 5'] },
        // },
        // {
        //   name: 'Mobile Safari',
        //   use: { ...devices['iPhone 12'] },
        // },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        // },
    ],
})
