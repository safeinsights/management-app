import { test, visitClerkProtectedPage } from './e2e.helpers'

test.describe('MFA authentication', async () => {
    test('adds using app', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'member' })

        await page.getByRole('button', { name: 'authenticator' }).click()

        await page.getByRole('button', { name: 'verify' }).click()

        await page.getByLabel('code').fill('123456')

        await page.getByRole('button', { name: 'verify' }).click()

        await page.waitForSelector(`text=incorrect`)

        await page.getByRole('button', { name: 'retry' }).click()
    })

    test('adds using sms', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'member' })
        await page.getByRole('button', { name: 'sms' }).click()

        await page.getByRole('button', { name: 'user profile' }).click()

        await page.waitForSelector('text=add phone number')

        await page.getByLabel('close modal').click()

        await page.getByRole('button', { name: 'homepage' }).click()
    })
})
