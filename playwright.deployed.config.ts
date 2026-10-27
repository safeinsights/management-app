import { defineConfig, devices, type ReporterDescription } from '@playwright/test'
import dotenv from 'dotenv'
import {
    DEPLOYED_ACTION_TIMEOUT,
    DEPLOYED_EXPECT_TIMEOUT,
    DEPLOYED_NAV_TIMEOUT,
    SMOKE_TEST_TIMEOUT,
    STAGE_TEST_TIMEOUT,
    resolveTarget,
} from './tests/deployed/config'

// The deployed-environment suite: a real deployment, real Clerk, real AWS. Pick the environment
// with E2E_TARGET (qa, staging, production, demo, or pr<N>); the accounts come from .env.deployed,
// which uses qa-review's variable names so one file serves both tools. See tests/deployed/README.md.
dotenv.config({ path: process.env.E2E_DEPLOYED_ENV_FILE ?? '.env.deployed' })
const target = resolveTarget()

const reporters: ReporterDescription[] = [
    ['list'],
    // Beside the artifacts, not inside them: Playwright clears outputDir on every run.
    ['html', { outputFolder: 'test-results/deployed-html', open: 'never' }],
    ['junit', { outputFile: 'test-results/deployed/junit.xml' }],
]
if (process.env.GITHUB_ACTIONS) reporters.push(['github'])

export default defineConfig({
    testDir: './tests/deployed',
    testMatch: '**/*.spec.ts',
    outputDir: 'test-results/deployed',
    // One set of accounts per environment, one enclave, and gates that are per account: the specs
    // share state, so they run one at a time. PLAYWRIGHT_WORKERS raises it for a smoke-only run.
    fullyParallel: false,
    workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,
    // Same rule as the hermetic suite: a test that passes only on retry is a bug. The external
    // systems vary in latency, which the bounded polls in tests/deployed/config.ts absorb.
    retries: Number(process.env.DEPLOYED_RETRIES ?? 0),
    forbidOnly: !!process.env.CI,
    timeout: STAGE_TEST_TIMEOUT,
    expect: { timeout: DEPLOYED_EXPECT_TIMEOUT },
    reporter: reporters,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: target.baseURL,
        actionTimeout: DEPLOYED_ACTION_TIMEOUT,
        navigationTimeout: DEPLOYED_NAV_TIMEOUT,
        trace: 'retain-on-failure',
        // A failure twenty minutes into a lifecycle needs more than a screenshot.
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        // Signs every role in once and saves the sessions. A project rather than globalSetup so a
        // failing real sign-in, the likeliest failure on a new environment, leaves a trace.
        { name: 'setup', testMatch: /auth\.setup\.ts/, timeout: SMOKE_TEST_TIMEOUT },
        { name: 'smoke', testMatch: /smoke\/.*\.spec\.ts/, dependencies: ['setup'], timeout: SMOKE_TEST_TIMEOUT },
        { name: 'full', testMatch: /full\/.*\.spec\.ts/, dependencies: ['setup'] },
    ],
    globalTeardown: './tests/deployed/global.teardown.ts',
})
