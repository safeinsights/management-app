import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { E2E_TIMEOUT_LONG } from './common.helpers'
import { faker } from '@faker-js/faker'
import { type Browser, type BrowserContext, type BrowserType, type Page, test as baseTest } from '@playwright/test'
import fs from 'fs'
import { addCoverageReport } from 'monocart-reporter'
import path from 'path'
import { fileURLToPath } from 'url'

export { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
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
                enableJsCoverage: true,
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
// Clerk's testing infrastructure (setupClerkTestingToken) intercepts all Clerk
// FAPI requests via a Playwright route handler that proxies them with a testing
// token. This proxy has no fetch timeout — if any single Clerk API request
// hangs (intermittent on their end), the route handler blocks forever and
// window.Clerk.loaded never becomes true.
//
// This causes two categories of flakiness in tests that sign in/out:
//
// 1. visitClerkProtectedPage hangs: clerkLoaded() waits for window.Clerk.loaded
//    which depends on the Clerk SDK completing its initialization requests. When
//    one of those requests hangs in the proxy, the whole sign-in flow stalls.
//
// 2. Stale SDK state after sign-out: Clerk's signOut() can also hang (same root
//    cause). When it does, the SDK is left in a broken state that blocks any
//    subsequent sign-in on the same page/context. Tests that sign out then sign
//    in as a different user must use a fresh browser context to avoid this.
//
// The production code (use-sign-out.ts) mitigates issue #2 with a Promise.race
// timeout on signOut() so the redirect always fires regardless.

const clerkLoaded = async (page: Page) => {
    await page.waitForFunction(() => window.Clerk !== undefined)
    await page.waitForFunction(() => window.Clerk.loaded)
    return await page.evaluate(() => window.Clerk?.user?.primaryEmailAddress?.emailAddress)
}

// This function is serialized and executed in the browser context
// concept: https://github.com/clerk/javascript/blob/main/packages/testing/src/common/helpers-utils.ts#L6
type ClerkSignInParams = {
    password: string
    identifier: string
    mfa: string
}

export const CLERK_MFA_CODE = '424242'

export const clerkSignInHelper = async (params: ClerkSignInParams) => {
    const w = window
    if (!w.Clerk.client) {
        console.error('Clerk client not found')
        return
    }

    const signIn = await w.Clerk.client.signIn.create({ identifier: params.identifier, password: params.password })

    if (signIn.status == 'complete') {
        await w.Clerk.setActive({ session: signIn.createdSessionId })
        return
    }

    if (
        signIn.status !== 'needs_second_factor' ||
        !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code')
    ) {
        throw new Error(
            `testing login's status: ${signIn.status} didn't support phone code? ${JSON.stringify(signIn.supportedSecondFactors)}`,
        )
    }
    await signIn.prepareSecondFactor({ strategy: 'phone_code' })
    const result = await signIn.attemptSecondFactor({
        strategy: 'phone_code',
        code: params.mfa,
    })
    if (result.status !== 'complete') {
        console.error(`Unknown signIn status: ${result.status}`)
    }

    await w.Clerk.setActive({ session: result.createdSessionId })
}

export const readTestSupportFile = (file: string) => {
    const filename = fileURLToPath(import.meta.url) // get the resolved path to the file

    return fs.promises.readFile(path.join(path.dirname(filename), 'support', file), 'utf8')
}

export type TestingRole = 'researcher' | 'reviewer' | 'admin'
export const TestingUsers: Record<TestingRole, ClerkSignInParams> = {
    admin: {
        mfa: CLERK_MFA_CODE,
        identifier: process.env.CLERK_ADMIN_EMAIL!,
        password: process.env.CLERK_ADMIN_PASSWORD!,
    },
    researcher: {
        mfa: CLERK_MFA_CODE,
        identifier: process.env.CLERK_RESEARCHER_EMAIL!,
        password: process.env.CLERK_RESEARCHER_PASSWORD!,
    },
    reviewer: {
        mfa: CLERK_MFA_CODE,
        identifier: process.env.CLERK_REVIEWER_EMAIL!,
        password: process.env.CLERK_REVIEWER_PASSWORD!,
    },
}

// Drives the sign-in form for `role`: email + password + SMS MFA, then waits for
// the post-sign-in redirect and confirms the session belongs to the expected user.
// Assumes the page is already on (or being navigated to) the sign-in screen with a
// Clerk testing token applied. Single seam for auth: the storageState setup project
// and the auth-UI specs both go through here, and swapping real Clerk for the
// clerk-stub later means changing only this body.
export const signInAsRole = async (page: Page, role: TestingRole) => {
    const creds = TestingUsers[role]

    await page.getByLabel('email').fill(creds.identifier)
    await page.getByLabel('password').fill(creds.password)
    await page.getByRole('button', { name: 'login' }).click()

    await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'SMS Verification' }).click()

    await page.getByRole('heading', { name: /verify your code/i }).waitFor({ state: 'visible' })
    await fillPinInput(page, creds.mfa, 'sms-pin-input')
    await page.getByRole('button', { name: 'Verify code' }).click()

    // Wait for MFA onSuccess to finish metadata update + token refresh + router.push
    await page.waitForURL((u) => !u.pathname.startsWith('/account/signin'), { timeout: 30000 })

    await page.waitForFunction(() => window.Clerk?.user?.primaryEmailAddress?.emailAddress)
    const updatedEmail = await clerkLoaded(page)
    if (updatedEmail != creds.identifier) {
        throw new Error(`Failed to sign in as ${role} with email ${creds.identifier}, user was: ${updatedEmail}`)
    }
}

// Per-role storageState file written by tests/auth.setup.ts and consumed by specs
// via `test.use({ storageState: authFileFor('reviewer') })`.
export const authFileFor = (role: TestingRole) =>
    path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth', `${role}.json`)

type VisitClerkProtectedPageOptions = { url: string; role: TestingRole; page: Page }

// Full sign-in-then-navigate. Retained for the auth-UI specs and any test not yet
// migrated to storageState. Tests that start from a saved session (the common case)
// should instead `test.use({ storageState: authFileFor(role) })` and call
// `visitAsRole(page, url)`, which skips the sign-in entirely.
export const visitClerkProtectedPage = async ({ page, url, role }: VisitClerkProtectedPageOptions) => {
    const creds = TestingUsers[role]

    await setupClerkTestingToken({ page })
    // load a page to initialize Clerk
    await page.goto('/')
    const currentEmail = await clerkLoaded(page)
    if (currentEmail == creds.identifier) {
        await goto(page, url)
        return
    }

    await page.evaluate(() => {
        return window.Clerk.session?.end()
    })

    await goto(page, '/account/signin')
    await signInAsRole(page, role)

    if (page.url() != url) {
        await goto(page, url)
        await clerkLoaded(page)
    }
}

// Navigate to a protected URL assuming the session is already restored from
// storageState. Re-applies the Clerk testing token (a per-page route handler, not
// stored state) and waits for hydration. This is the fast path that replaces
// visitClerkProtectedPage once a spec declares `test.use({ storageState })`.
export const visitAsRole = async (page: Page, url: string) => {
    await setupClerkTestingToken({ page })
    await goto(page, url)
}

export async function fillLexicalField(page: Page, ariaLabel: string, text: string) {
    const field = page.locator(`[aria-label="${ariaLabel}"]`)
    await field.click()
    await page.keyboard.type(text)
}

// Opens a fresh browser context, signs in as the named role, navigates to `url`,
// and returns both the context (for the caller to close) and its page. Use when a
// test needs a second concurrent session in parallel with the main `page`, e.g.
// simulating two reviewers in the same DO collaborating on a code review.
// The caller is responsible for `context.close()` (typically in a try/finally).
export const openContextAsRole = async (
    browser: Browser,
    { role, url }: { role: TestingRole; url: string },
): Promise<{ context: BrowserContext; page: Page }> => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await visitClerkProtectedPage({ page, role, url })
    return { context, page }
}

// Opens a context that restores `role`'s saved session from storageState (no
// sign-in), applies the Clerk testing token, and returns the context + page. The
// storageState file must exist (written by the `auth setup` project). Caller closes
// the context. This is the fast multi-role primitive: a single seeded test acts as
// researcher and reviewer by opening one of these per role instead of re-signing-in.
export const openContextWithSavedRole = async (
    browser: Browser,
    role: TestingRole,
): Promise<{ context: BrowserContext; page: Page }> => {
    const context = await browser.newContext({ storageState: authFileFor(role) })
    const page = await context.newPage()
    await setupClerkTestingToken({ page })
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

// After a Clerk sign-in, `user.publicMetadata.orgs` is populated either directly or
// via a `syncUserMetadataAction` fallback that round-trips to the server. Wait until
// it actually contains openstax so downstream reviewer interactions have a properly
// seeded session — a timeout here points at the seed/session, not at editor mounting.
// Shared by the collaboration specs (proposal- and code-review).
export const waitForOpenstaxOrgInClerkMetadata = async (page: Page): Promise<void> => {
    await page.waitForFunction(
        () => {
            const w = window as unknown as {
                Clerk?: {
                    user?: { publicMetadata?: { orgs?: Record<string, unknown>; teams?: Record<string, unknown> } }
                }
            }
            const orgs = w.Clerk?.user?.publicMetadata?.orgs ?? w.Clerk?.user?.publicMetadata?.teams ?? {}
            const keys = Object.keys(orgs)
            return keys.includes('openstax') || keys.includes('openstax-lab')
        },
        undefined,
        { timeout: E2E_TIMEOUT_LONG },
    )
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
