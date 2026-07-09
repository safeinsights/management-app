import { ROLE_FIXTURES } from '@/lib/clerk-fake/fixtures'
import { faker } from '@faker-js/faker'
import { type Browser, type BrowserContext, type BrowserType, type Page, test as baseTest } from '@playwright/test'
import fs from 'fs'
import { addCoverageReport } from 'monocart-reporter'
import path from 'path'
import { fileURLToPath } from 'url'

export * from './common.helpers'
export { fs, path }

// since we're extending test from here, we might as well export some other often-used items
export { expect, type Page } from '@playwright/test'

export type CollectV8CodeCoverageOptions = {
    browserType: BrowserType
    page: Page
    use: () => Promise<void>
    enableJsCoverage: boolean
    enableCssCoverage: boolean
}

export async function goto(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.isReactHydrated)
}

function browserSupportsV8CodeCoverage(browserType: BrowserType): boolean {
    return browserType.name() === 'chromium'
}

// See https://playwright.dev/docs/api/class-coverage.
// This instruments code using v8 and then attaches the code coverage data
// to the monocart-reporter.
export async function collectV8CodeCoverageAsync(options: CollectV8CodeCoverageOptions): Promise<void> {
    const v8CodeCoverageSupported = browserSupportsV8CodeCoverage(options.browserType)
    const codeCoverageEnabled = options.enableJsCoverage || options.enableCssCoverage
    if (!v8CodeCoverageSupported || !codeCoverageEnabled) {
        await options.use()
        return
    }
    const page = options.page
    const startCoveragePromises: Promise<void>[] = []
    if (options.enableJsCoverage) {
        const startJsCoveragePromise = page.coverage.startJSCoverage({
            resetOnNavigation: false,
        })
        startCoveragePromises.push(startJsCoveragePromise)
    }
    if (options.enableCssCoverage) {
        const startCssCoveragePromise = page.coverage.startCSSCoverage({
            resetOnNavigation: false,
        })
        startCoveragePromises.push(startCssCoveragePromise)
    }
    await Promise.all(startCoveragePromises)
    await options.use()

    const stopCoveragePromises: Promise<unknown>[] = []
    if (options.enableJsCoverage) {
        const stopJsCoveragePromise = page.coverage.stopJSCoverage()
        stopCoveragePromises.push(stopJsCoveragePromise)
    }
    if (options.enableCssCoverage) {
        const stopCssCoveragePromise = page.coverage.stopCSSCoverage()
        stopCoveragePromises.push(stopCssCoveragePromise)
    }
    const coverageReports = await Promise.all(stopCoveragePromises)
    const coverageData = coverageReports.flat()
    if (coverageData.length > 0) {
        await addCoverageReport(coverageData, test.info())
    }
}

class StudyFeatures {
    public studyTitle = `${faker.hacker.ingverb()} ${faker.commerce.productName().toLowerCase()}`

    uniqueTitle(suffix: string) {
        return `${this.studyTitle} - ${suffix} ${Date.now()}`
    }

    static perWorkerFeatures: Record<number, StudyFeatures> = {}

    static getFeature(workerIndex: number) {
        return (
            StudyFeatures.perWorkerFeatures[workerIndex] ||
            (StudyFeatures.perWorkerFeatures[workerIndex] = new StudyFeatures())
        )
    }
}

// See https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
// Note that we pass page scoped as first and worker fixture types as a second template parameter.
export const test = baseTest.extend<{ codeCoverageAutoTestFixture: void }, { studyFeatures: StudyFeatures }>({
    codeCoverageAutoTestFixture: [
        async ({ browser, page }, use): Promise<void> => {
            const options: CollectV8CodeCoverageOptions = {
                browserType: browser.browserType(),
                page: page,
                use: use,
                // V8 coverage start/stop runs on every test. It's only needed for the
                // coverage report (the test:coverage step / CI), so allow opting out
                // (E2E_COVERAGE=0) to speed up local iteration runs.
                enableJsCoverage: process.env.E2E_COVERAGE !== '0',
                enableCssCoverage: false,
            }
            await collectV8CodeCoverageAsync(options)
        },
        { auto: true },
    ],
    studyFeatures: [
        // must use object, see https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
        // eslint-disable-next-line no-empty-pattern
        async ({}, use, workerInfo) => {
            const feat = StudyFeatures.getFeature(workerInfo.workerIndex)
            await use(feat)
        },
        { scope: 'worker' },
    ],
})

// --- Clerk testing helpers ---
//
// Auth is faked in-app (src/lib/clerk-fake) — there is no Clerk server. Sessions are just
// the __e2e_role cookie: seeded per role in global.setup.ts and restored via storageState;
// the sign-in form drives a faked useSignIn that writes the cookie on completion.

// Ensures a signed-out state by clearing the __e2e_role cookie (the fake's session is
// just that cookie). Used by the auth-UI specs before driving the sign-in form.
export const e2eSignOut = async (page: Page) => {
    await page
        .context()
        .clearCookies({ name: '__e2e_role' })
        .catch(() => {})
}

type ClerkSignInParams = {
    password: string
    identifier: string
    mfa: string
}

export const CLERK_MFA_CODE = '424242'

export const readTestSupportFile = (file: string) => {
    const filename = fileURLToPath(import.meta.url) // get the resolved path to the file

    return fs.promises.readFile(path.join(path.dirname(filename), 'support', file), 'utf8')
}

export type TestingRole = 'researcher' | 'reviewer' | 'admin'

// Credentials for driving the faked sign-in form. Identifiers come from the same
// fixtures the in-app fake matches on (src/lib/clerk-fake/fixtures); the password is any
// non-empty value (the fake accepts it for a known email). No real secrets needed.
const FAKE_PASSWORD = 'e2e-fake-password'
export const TestingUsers: Record<TestingRole, ClerkSignInParams> = {
    admin: { mfa: CLERK_MFA_CODE, identifier: ROLE_FIXTURES.admin.email, password: FAKE_PASSWORD },
    researcher: { mfa: CLERK_MFA_CODE, identifier: ROLE_FIXTURES.researcher.email, password: FAKE_PASSWORD },
    reviewer: { mfa: CLERK_MFA_CODE, identifier: ROLE_FIXTURES.reviewer.email, password: FAKE_PASSWORD },
}

// Per-role storageState file written by tests/global.setup.ts and consumed by specs
// via `test.use({ storageState: authFileFor('reviewer') })`.
export const authFileFor = (role: TestingRole) =>
    path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth', `${role}.json`)

// Navigate to a protected URL assuming the session is already restored from
// storageState (the __e2e_role cookie), then wait for hydration.
export const visitAsRole = async (page: Page, url: string) => {
    await goto(page, url)
}

export async function fillLexicalField(page: Page, ariaLabel: string, text: string) {
    const field = page.locator(`[aria-label="${ariaLabel}"]`)
    await field.click()
    await page.keyboard.type(text)
}

// Opens a context that restores `role`'s saved session from storageState (no
// sign-in) and returns the context + page. The storageState file must exist (written
// by globalSetup). Caller closes the context. This is the fast
// multi-role primitive: a single seeded test acts as researcher and reviewer by
// opening one of these per role instead of re-signing-in.
export const openContextWithSavedRole = async (
    browser: Browser,
    role: TestingRole,
): Promise<{ context: BrowserContext; page: Page }> => {
    const context = await browser.newContext({ storageState: authFileFor(role) })
    const page = await context.newPage()
    return { context, page }
}

// Runs `fn` against a page authenticated as `role` (session restored from
// storageState), then tears the context down. Keeps role-switching explicit and
// cheap inside a seeded test: `await withRole(browser, 'reviewer', async (page) =>
// { ... })`.
export const withRole = async (
    browser: Browser,
    role: TestingRole,
    fn: (page: Page) => Promise<void>,
): Promise<void> => {
    const { context, page } = await openContextWithSavedRole(browser, role)
    try {
        await fn(page)
    } finally {
        await context.close()
    }
}

export const fillPinInput = async (page: Page, pinCode: string, testId: string) => {
    const pin = pinCode.split('')
    // Try to find inputs within the testId element, fallback to direct selection
    let pinInputs = page.getByTestId(testId).locator('input')
    const count = await pinInputs.count()
    if (count === 0) {
        // Fallback: try to find the PinInput group directly
        pinInputs = page.locator('[role="group"]').locator('input[placeholder="0"]')
    }
    for (let i = 0; i < pin.length; i++) {
        await pinInputs.nth(i).fill(pin[i])
    }
}
