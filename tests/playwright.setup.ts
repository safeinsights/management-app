import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup, expect } from '@playwright/test'

setup('global setup', async ({}) => {
    await clerkSetup()

    for (const role of ['RESEARCHER']) {
        for (const part of ['EMAIL', 'PASSWORD']) {
            const env = `E2E_CLERK_${role}_${part}`
            if (!process.env[env]) {
                throw new Error(`Please provide ${env} environment variables.`)
            }
        }
    }
})

const memberFile = 'tests/.auth/member.json'
const researcherFile = 'tests/.auth/researcher.json'

setup('authenticate as member', async ({ page }) => {
    await clerkSetup()

    await setupClerkTestingToken({ page })
    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env.E2E_CLERK_MEMBER_EMAIL!,
            password: process.env.E2E_CLERK_MEMBER_PASSWORD!,
        },
    })

    await page.goto('/')

    await page.context().storageState({ path: memberFile })
})

setup('authenticate as researcher', async ({ page }) => {
    await clerkSetup()

    await setupClerkTestingToken({ page })
    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env.E2E_CLERK_RESEARCHER_EMAIL!,
            password: process.env.E2E_CLERK_RESEARCHER_PASSWORD!,
        },
    })

    await page.goto('/')

    await page.context().storageState({ path: researcherFile })
})
