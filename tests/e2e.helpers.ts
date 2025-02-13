import { type BrowserType, type Page, test as baseTest } from '@playwright/test'
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
    const stopCoveragePromises: Promise<any>[] = []
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

type VisitClerkProtectedPageOptions = { url: string; role: 'researcher'; page: Page }
export const visitClerkProtectedPage = async ({ page, url }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)

    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env.E2E_CLERK_RESEARCHER_EMAIL!,
            password: process.env.E2E_CLERK_RESEARCHER_PASSWORD!,
        },
    })
}
