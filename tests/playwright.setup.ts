import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

setup('global setup', async ({}) => {
    await clerkSetup()

    for (const role of ['RESEARCHER', 'REVIEWER']) {
        for (const part of ['EMAIL', 'PASSWORD']) {
            const env = `E2E_CLERK_${role}_${part}`
            if (!process.env[env]) {
                throw new Error(`Please provide ${env} environment variables.`)
            }
        }
    }
})
