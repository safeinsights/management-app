import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { faker } from '@faker-js/faker'
import { type BrowserType, type Page, test as baseTest } from '@playwright/test'
import fs from 'fs'
import { addCoverageReport } from 'monocart-reporter'
import path from 'path'
import { fileURLToPath } from 'url'

export { clerk } from '@clerk/testing/playwright'
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
    await addCoverageReport(coverageReports.flat(), test.info())
}

class StudyFeatures {
    public studyTitle = `${faker.hacker.ingverb()} ${faker.commerce.productName().toLowerCase()}`

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
        async ({}, use, workerInfo) => {
            const feat = StudyFeatures.getFeature(workerInfo.workerIndex)
            await use(feat)
        },
        { scope: 'worker' },
    ],
})

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

type VisitClerkProtectedPageOptions = { url: string; role: TestingRole; page: Page }

export const visitClerkProtectedPage = async ({ page, url, role }: VisitClerkProtectedPageOptions) => {
    const creds = TestingUsers[role]

    await setupClerkTestingToken({ page })
    await goto(page, url)
    const currentEmail = await clerkLoaded(page)
    if (currentEmail == creds.identifier) {
        return
    }

    await page.evaluate(() => {
        return window.Clerk.session?.end()
    })

    await goto(page, '/account/signin')

    await page.getByLabel('email').fill(creds.identifier)
    await page.getByLabel('password').fill(creds.password)
    await page.getByRole('button', { name: 'login' }).click()

    await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'SMS Verification' }).click()

    await page.getByRole('heading', { name: /verify your code/i }).waitFor({ state: 'visible' })
    await fillPinInput(page, creds.mfa, 'sms-pin-input')
    await page.getByRole('button', { name: 'Verify code' }).click()
    await page.waitForLoadState()

    await page.waitForFunction(() => window.Clerk?.user?.primaryEmailAddress?.emailAddress)
    const updatedEmail = await clerkLoaded(page)
    if (updatedEmail != creds.identifier) {
        throw new Error(`Failed to sign in as ${role} with email ${creds.identifier}, user was: ${updatedEmail}`)
    }
    //  the earlier goto likely navigated to signin
    if (page.url() != url) {
        await goto(page, url)
        await clerkLoaded(page)
    }
}

export const fillPinInput = async (page: Page, pinCode: string, testId: string) => {
    const pin = pinCode.split('')
    const pinInputs = page.getByTestId(testId).locator('input')
    for (let i = 0; i < pin.length; i++) {
        await pinInputs.nth(i).fill(pin[i])
    }
}
