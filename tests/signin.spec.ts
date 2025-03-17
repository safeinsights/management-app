import { clerk, test, TestingUsers, CLERK_MFA_CODE } from './e2e.helpers'

test.describe('user sign in', async () => {
    for (const [role, props] of Object.entries(TestingUsers)) {
        test(`login as ${role}`, async ({ page }) => {
            await page.goto('/account/signin')
            await clerk.signOut({ page }) // probably not needed

            const fillForm = async () => {
                await page.getByLabel('email').fill(props.identifier)
                await page.getByLabel('password').fill(props.password)
                await page.getByRole('button', { name: 'login' }).click()
            }

            await fillForm()

            // await page.getByRole('button', { name: 'reenter' }).click()

            // await fillForm()

            // await page.getByLabel('code').fill(CLERK_MFA_CODE)
            await page.getByRole('button', { name: 'login' }).click()

            // await page.waitForSelector('text=success')
        })
    }
})
