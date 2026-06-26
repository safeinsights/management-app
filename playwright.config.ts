import { defineConfig, devices, type ReporterDescription } from '@playwright/test'
import dotenv from 'dotenv'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'
import { IS_CI, E2E_TIMEOUT, E2E_TIMEOUT_LONG, E2E_EXPECT_TIMEOUT } from './tests/e2e.helpers'

// Load the isolated test env (test port + separate DB). Keeps the suite independent of
// local dev (.env / port 4000 / real Clerk). On CI the equivalent values are provided as
// job env, so a missing file here is fine. Auth is faked in-app via E2E_FAKE_CLERK
// (src/lib/clerk-fake) — no external Clerk server is involved.
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
    // Write per-role storageState + warm routes once before any spec, in-process (no
    // separate worker pool / browser-launch barrier — see tests/global.setup.ts).
    globalSetup: './tests/global.setup.ts',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: IS_CI,

    // No retries: a test that only passes on retry is a flaky test, and flaky tests are
    // bugs to fix at the source — not to paper over. The suite must pass at retries=0.
    retries: 0,
    // Faked auth (src/lib/clerk-fake) + per-test uniquely-titled studies mean specs are
    // data-isolated, so run fully parallel. Playwright defaults to ~half the cores; our
    // tests are mostly I/O-wait (server / browser / DB), so use ALL cores instead — on a
    // 4-vCPU CI runner that's 4 workers vs the default 2, roughly halving wall-clock.
    // Override with PLAYWRIGHT_WORKERS when needed.
    workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : '100%',
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

    // Playwright owns the testing-only app instance (4100): bin/app-test builds the app
    // (with E2E_FAKE_CLERK so Clerk is faked in-process — no external auth server) and
    // serves the prebuilt standalone server. We do NOT use `next dev` — its lazy per-route
    // compilation is slow and unstable under the suite. The shared infra (Postgres +
    // SeaweedFS + the test DB) is brought up first by `pnpm test:e2e:up`. On CI the app is
    // built+started by bin/ci-server, so no webServer is managed here. The timeout covers a
    // full `next build`; `reuseExistingServer` lets you keep a manually-started server
    // (./bin/app-test, or ./bin/app-test --no-build) running across iterations.
    webServer: IS_CI
        ? []
        : [
              {
                  command: 'pnpm run app:test',
                  url: E2E_BASE_URL,
                  reuseExistingServer: true,
                  timeout: 300_000,
              },
          ],

    outputDir: 'test-results/e2e',

    /* Configure projects for major browsers */
    projects: [
        {
            // Specs opt in with `test.use({ storageState: authFileFor(role) })` to start
            // authenticated. The storageState files + route warmup are produced by
            // globalSetup (tests/global.setup.ts); DB users/orgs are seeded by
            // `pnpm test:e2e:up` (db:migrate). No separate auth-setup project/barrier.
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
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
