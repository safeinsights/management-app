import { defineConfig, devices, type ReporterDescription } from '@playwright/test'
import dotenv from 'dotenv'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'
import { IS_CI, E2E_TIMEOUT, E2E_TIMEOUT_LONG, E2E_EXPECT_TIMEOUT } from './tests/e2e.helpers'

// Load the isolated test env (test port + separate DB + clerk-stub). Keeps the suite
// independent of local dev (.env / port 4000 / real Clerk). On CI the equivalent
// values are provided as job env, so a missing file here is fine.
dotenv.config({ path: '.env.test' })

// The Playwright-owned app instance runs on this port (dev stays on 4000).
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4100'

const reporters: ReporterDescription[] = []
if (process.argv.includes('--ui')) {
    reporters.push(['list'])
} else {
    reporters.push(
        ['list'],
        [
            'monocart-reporter',
            {
                outputFile: './test-results/e2e/index.html',
                coverage: {
                    entryFilter: (entry: { url: string; source: string }) => {
                        return entry.url?.match(/\/chunks\/src/) && !entry.source?.match(/TURBOPACK_CHUNK_LISTS/)
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
        ],
    )
}

if (IS_CI) reporters.push(['github'])

export default defineConfig({
    testDir: './tests',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: IS_CI,

    retries: IS_CI ? 2 : 1,
    /* Opt out of parallel tests on CI. */
    workers: IS_CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: reporters,
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        baseURL: E2E_BASE_URL,
        actionTimeout: E2E_TIMEOUT,
        navigationTimeout: E2E_TIMEOUT,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    timeout: E2E_TIMEOUT_LONG,
    expect: {
        timeout: E2E_EXPECT_TIMEOUT,
    },

    // Playwright owns the testing-only stack: clerk-stub (4040) + the app (4100).
    // Locally these are started on demand and reused if already up; the shared infra
    // (Postgres + SeaweedFS + the test DB) is brought up first by `pnpm test:e2e:up`.
    // On CI the app is built+started by bin/ci-server, so only the stub is managed here.
    webServer: IS_CI
        ? [
              {
                  command: 'pnpm run clerk-stub:test',
                  url: process.env.E2E_STUB_HEALTH_URL ?? 'https://clerk.lvh.me:4040/health',
                  reuseExistingServer: false,
                  timeout: 120_000,
                  ignoreHTTPSErrors: true,
              },
          ]
        : [
              {
                  command: 'pnpm run clerk-stub:test',
                  url: process.env.E2E_STUB_HEALTH_URL ?? 'https://clerk.lvh.me:4040/health',
                  reuseExistingServer: true,
                  timeout: 120_000,
                  ignoreHTTPSErrors: true,
              },
              {
                  command: 'pnpm run app:test',
                  url: E2E_BASE_URL,
                  reuseExistingServer: true,
                  timeout: 180_000,
              },
          ],

    outputDir: 'test-results/e2e',

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'global setup',
            testMatch: /playwright\.setup\.ts/,
            teardown: 'global teardown',
        },
        {
            // Signs in each role once and writes tests/.auth/<role>.json. Specs opt in
            // with `test.use({ storageState: authFileFor(role) })` to start authenticated.
            name: 'auth setup',
            testMatch: /auth\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['global setup'],
        },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['auth setup'],
        },
        {
            name: 'global teardown',
            testMatch: /playwright\.teardown\.ts/,
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
