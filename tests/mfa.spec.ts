import { test, expect, visitClerkProtectedPage } from './e2e.helpers'

test.describe('MFA Setup Visibility', () => {
    // Use the same worker
    test.describe.configure({ mode: 'serial' })

    test('checks Authenticator App page elements', async ({ page }) => {
        // Go DIRECTLY to the authenticator app page
        await visitClerkProtectedPage({ page, url: '/account/mfa/app?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Check if the code input field is visible
        await expect(page.getByPlaceholder('000000')).toBeVisible()

        // Check if the Verify Code button is visible and initially disabled (as no code is entered)
        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await expect(verifyButton).toBeVisible()
        await expect(verifyButton.disabled).toBe(true)
    })

    test('checks SMS page elements', async ({ page }) => {
        // Visit the main MFA page first
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Navigate to the SMS setup page
        await page.getByRole('link', { name: 'SMS Verification' }).click()
        await page.waitForURL('**/account/mfa/sms') // Wait for navigation

        // Check if the Phone Number input is visible
        // Assuming test user has no pre-filled number, it should be enabled
        const phoneInput = page.getByLabel('Phone Number')
        await expect(phoneInput).toBeVisible()

        // Check if the Send Code button is visible and enabled
        const sendCodeButton = page.getByRole('button', { name: 'Send Code' })
        await expect(sendCodeButton).toBeVisible()
    })
})
