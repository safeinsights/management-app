import { test, expect, visitClerkProtectedPage } from './e2e.helpers'

test.describe('MFA Setup Visibility', () => {
    // Use the same worker
    test.describe.configure({ mode: 'serial' })

    test('renders the sms and authenticator buttons', async ({ page }) => {
        // Visit the main MFA page first
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'reviewer' })
        await expect(page.getByRole('link', { name: 'SMS Verification' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Authenticator App Verification' })).toBeVisible()
    })

    test('checks Authenticator App page elements', async ({ page }) => {
        // Go DIRECTLY to the authenticator app page
        await visitClerkProtectedPage({ page, url: '/account/mfa/app?TESTING_FORCE_NO_MFA=1', role: 'reviewer' })

        // Check if the code input field is visible
        await expect(page.getByPlaceholder('000000')).toBeVisible()

        // Check if the Verify Code button is visible and initially disabled (as no code is entered)
        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await expect(verifyButton).toBeVisible()
        await expect(verifyButton).toBeDisabled()
    })

    test('checks SMS page elements', async ({ page }) => {
        // Navigate to the SMS setup page
        await visitClerkProtectedPage({ page, url: '/account/mfa/sms?TESTING_FORCE_NO_MFA=1', role: 'reviewer' })

        // Check if the Phone Number input is visible
        await page.getByPlaceholder('Enter phone number').fill('+15555550101')
        await page.getByRole('button', { name: /send code/i }).click()

        await page.getByLabel('Input Code').fill('424242')
        await page.getByRole('button', { name: /verify code/i }).click()
    })
})
