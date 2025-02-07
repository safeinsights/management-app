import { type BrowserType, type Page, test as baseTest } from '@playwright/test'
import { BLANK_UUID, db } from '@/database'
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'

export * from './common.helpers'
export { fs, path }

// since we're extending test from here, we might as well export some other often-used items
export { expect, type Page } from '@playwright/test'

export const USE_COVERAGE = process.argv.includes('--coverage')
import { addCoverageReport } from 'monocart-reporter'

export type CollectV8CodeCoverageOptions = {
    browserType: BrowserType
    page: Page
    use: () => Promise<void>
    enableJsCoverage: boolean
    enableCssCoverage: boolean
}

export const enum Role {
    Member = 'MEMBER',
    Researcher = 'RESEARCHER'
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

type VisitClerkProtectedPageOptions = { url: string; role: Role; page: Page }
export const visitClerkProtectedPage = async ({ page, role, url }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)

    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env[`E2E_CLERK_${role}_EMAIL`]!,
            password: process.env[`E2E_CLERK_${role}_PASSWORD`]!,
        },
    })
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
