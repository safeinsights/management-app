import { type Page, test, expect } from '@playwright/test'
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'

type VisitClerkProtectedPageOptions = { url: string; role: 'researcher'; page: Page }
export const visitClerkProtectedPage = async ({ page, url }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)
    console.log('LOGIN WITH', {
        url,
        id: process.env.E2E_CLERK_RESEARCHER_EMAIL!.slice(0, 6),
        pwda: process.env.E2E_CLERK_RESEARCHER_PASSWORD!.slice(0, 6),
    })
    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env.E2E_CLERK_RESEARCHER_EMAIL!,
            password: process.env.E2E_CLERK_RESEARCHER_PASSWORD!,
        },
    })
}
