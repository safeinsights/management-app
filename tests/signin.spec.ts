import { CLERK_MFA_CODE, e2eSignOut, expect, fillPinInput, test, TestingUsers } from './e2e.helpers'

test.describe('user sign in', async () => {
    for (const [role, props] of Object.entries(TestingUsers)) {
        test(`login as ${role}`, async ({ page }) => {
            await page.goto('/account/signin')
            await e2eSignOut(page)

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

            // Keyless roles land on the security-key page instead of My studies.
            await page
                .getByRole('heading', { name: /my studies|security key/i })
                .first()
                .waitFor({ state: 'visible' })
        })
    }
})
