import { activeSession } from '../auth'
import { DEPLOYED_ROLES } from '../env'
import { expect, test } from '../fixtures'

// Real Clerk, this environment's instance: the sessions the setup project saved are the proof that
// sign-in, MFA and the authorized party for this host all line up.

for (const role of DEPLOYED_ROLES) {
    test(`the ${role} session opens the app as that account`, async ({ accounts, roleContext }) => {
        const { page } = await roleContext(role)
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('link', { name: 'My studies', exact: true }).first()).toBeVisible()
        const session = await activeSession(page)
        expect(session.email?.toLowerCase()).toBe(accounts[role].email.toLowerCase())
    })
}

test('a signed-in visit to the sign-in page offers to continue', async ({ roleContext }) => {
    const { page } = await roleContext('reviewer')
    await page.goto('/account/signin', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/already signed in/i).first()).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('link', { name: 'My studies', exact: true }).first()).toBeVisible()
})
