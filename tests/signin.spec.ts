import { clerk, CLERK_MFA_CODE, expect, fillPinInput, test, TestingUsers } from './e2e.helpers'

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

            await page
                .getByRole('heading', { name: /multi-factor authentication required/i })
                .waitFor({ state: 'visible' })
            await page.getByRole('button', { name: 'SMS Verification' }).click()

            await page.getByRole('heading', { name: /verify your code/i }).waitFor({ state: 'visible' })
            await fillPinInput(page, CLERK_MFA_CODE, 'sms-pin-input')
            const verifyBtn = page.getByRole('button', { name: /verify code/i })
            await expect(verifyBtn).toBeEnabled()
            await verifyBtn.click()

            // Wait for successful login to load dashboard. Note that for some roles
            // the reviewer key page is actually what loads but that also works since it contains the word 'dashboard'
            await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })
        })
    }
})
