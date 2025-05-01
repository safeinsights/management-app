import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

setup('global setup', async ({}) => {
    await clerkSetup()

    for (const role of ['RESEARCHER']) {
        for (const part of ['EMAIL', 'PASSWORD']) {
            const env = `CLERK_${role}_${part}`
            if (!process.env[env]) {
                throw new Error(`Please provide ${env} environment variables.`)
            }
        }
    }
})
