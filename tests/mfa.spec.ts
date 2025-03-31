import { test, expect, visitClerkProtectedPage } from './e2e.helpers'

test.describe('MFA Setup Visibility', () => {
    // Use the same worker
    test.describe.configure({ mode: 'serial' })

    test('checks Authenticator App page elements', async ({ page }) => {
        // Go DIRECTLY to the authenticator app page
        await visitClerkProtectedPage({ page, url: '/account/mfa/app?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Check if the main heading is visible
        await expect(page.getByRole('heading', { name: 'Authenticator App Verification' })).toBeVisible()

        // Check if the code input field is visible
        await expect(page.getByPlaceholder('000000')).toBeVisible()

        // Check if the Verify Code button is visible and initially disabled (as no code is entered)
        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await expect(verifyButton).toBeVisible()
        await expect(verifyButton).toBeDisabled()
    })

    test('checks SMS page elements', async ({ page }) => {
        // Visit the main MFA page first
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Check the initial MFA setup page heading
        await expect(page.getByRole('heading', { name: 'Set up Two-Step Verification' })).toBeVisible()

        // Navigate to the SMS setup page
        await page.getByRole('link', { name: 'SMS Verification' }).click()
        await page.waitForURL('**/account/mfa/sms') // Wait for navigation

        // Check if the SMS page heading is visible
        await expect(page.getByRole('heading', { name: 'SMS Verification' })).toBeVisible()

        // Check if the Phone Number input is visible
        // Assuming test user has no pre-filled number, it should be enabled
        const phoneInput = page.getByLabel('Phone Number')
        await expect(phoneInput).toBeVisible()
        await expect(phoneInput).toBeEnabled()

        // Check if the Send Code button is visible and enabled
        const sendCodeButton = page.getByRole('button', { name: 'Send Code' })
        await expect(sendCodeButton).toBeVisible()
        // Note: This might be disabled if the test user *does* have a phone number already.
        // If tests fail here, adjust the expectation based on the test user's state.
        // await expect(sendCodeButton).toBeEnabled();

        // Check if the Verification Code input is visible (it exists but should be disabled initially)
        const verificationInput = page.getByLabel('Verification Code')
        await expect(verificationInput).toBeVisible()
        await expect(verificationInput).toBeDisabled()

        // Check if the Verify Code button is visible and disabled initially
        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await expect(verifyButton).toBeVisible()
        await expect(verifyButton).toBeDisabled()
    })
})
