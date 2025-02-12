import { type BrowserType, type Page, test as baseTest } from '@playwright/test'
import { BLANK_UUID, db } from '@/database'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'

export * from './common.helpers'
export { fs, path }

// since we're extending test from here, we might as well export some other often-used items
export { expect, type Page } from '@playwright/test'

export const USE_COVERAGE = process.argv.includes('--coverage')
import { addCoverageReport } from 'monocart-reporter'
//import { useSignIn } from '@clerk/nextjs'

export type CollectV8CodeCoverageOptions = {
    browserType: BrowserType
    page: Page
    use: () => Promise<void>
    enableJsCoverage: boolean
    enableCssCoverage: boolean
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
    let startCoveragePromises: Promise<void>[] = []
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
    let stopCoveragePromises: Promise<any>[] = []
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

// See https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
interface AppFixtures {
    codeCoverageAutoTestFixture: void
}

// Export the extended test type.
// All tests that use this export 'test' type will have the automatic fixture applied to them.
export const test = baseTest.extend<AppFixtures>({
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
        {
            auto: true,
        },
    ],
})

const clerkLoaded = async (page: Page) => {
    await page.waitForFunction(() => window.Clerk !== undefined)
    await page.waitForFunction(() => window.Clerk.loaded)
}

// This function is serialized and executed in the browser context
// concept: https://github.com/clerk/javascript/blob/main/packages/testing/src/common/helpers-utils.ts#L6
type ClerkSignInParams = {
    password: string
    identifier: string
}

const clerkSignInHelper = async (params: ClerkSignInParams) => {
    const w = window
    if (!w.Clerk.client) {
        return
    }

    const signIn = await w.Clerk.client.signIn.create({ identifier: params.identifier, password: params.password })

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
        code: '424242',
    })

    if (result.status === 'complete') {
        await w.Clerk.setActive({ session: result.createdSessionId })
    } else {
        reportError(`Unknown signIn status: ${result.status}`)
    }
}
type TestingRole = 'researcher' | 'member'
const TestingUsers: Record<TestingRole, ClerkSignInParams> = {
    researcher: {
        identifier: process.env.E2E_CLERK_RESEARCHER_EMAIL!,
        password: process.env.E2E_CLERK_RESEARCHER_PASSWORD!,
    },
    member: {
        identifier: process.env.E2E_CLERK_MEMBER_EMAIL!,
        password: process.env.E2E_CLERK_MEMBER_PASSWORD!,
    },
}

type VisitClerkProtectedPageOptions = { url: string; role: TestingRole; page: Page }

export const visitClerkProtectedPage = async ({ page, url, role }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)
    await clerkLoaded(page)
    await page.evaluate(clerkSignInHelper, TestingUsers[role])

    //  the earlier page.goto likely navigated to signin
    if (page.url() != url) {
        await page.goto(url)
    }
}

export const insertTestStudyData = async (opts: { memberId: string }) => {
    const study = await db
        .insertInto('study')
        .values({
            memberId: opts.memberId,
            containerLocation: 'test-container',
            title: 'my 1st study',
            description: 'my description',
            researcherId: BLANK_UUID,
            piName: 'test',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run0 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'INITIATED',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run1 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'RUNNING',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run2 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'READY',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        memberId: opts.memberId,
        studyId: study.id,
        runIds: [run0.id, run1.id, run2.id],
    }
}
