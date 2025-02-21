import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import { clerkSignInHelper, TestingUsers } from '@/tests/e2e.helpers'

// Set these in up order
setup.describe.configure({ mode: 'serial' })

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
    await page.goto('/account/signin')
    await clerk.loaded({ page })

    const member = TestingUsers['member']

    await page.evaluate(async (member) => {
        const w = window
        if (!w.Clerk.client) {
            return
        }

        const signIn = await w.Clerk.client.signIn.create({
            identifier: member.identifier,
            password: member.password,
        })

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
            code: member.mfa,
        })

        if (result.status === 'complete') {
            await w.Clerk.setActive({ session: result.createdSessionId })
        } else {
            reportError(`Unknown signIn status: ${result.status}`)
        }
    }, member)

    await page.goto('/')

    await page.context().storageState({ path: memberFile })
})

setup('authenticate as researcher', async ({ page }) => {
    await clerkSetup()
    await setupClerkTestingToken({ page })
    await page.goto('/account/signin')
    await clerk.loaded({ page })
    await page.evaluate(clerkSignInHelper, TestingUsers['researcher'])

    await page.goto('/')

    await page.context().storageState({ path: researcherFile })
})
