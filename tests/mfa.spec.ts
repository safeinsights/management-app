import { test, expect, visitClerkProtectedPage, CLERK_MFA_CODE } from './e2e.helpers'

test.describe('MFA Setup', () => {
    // Use the same worker to potentially share state if needed, though not strictly necessary here.
    test.describe.configure({ mode: 'serial' })

    test('adds MFA using Authenticator App', async ({ page }) => {
        // Visit the main MFA page, forcing the setup flow
        // Go DIRECTLY to the authenticator app page
        await visitClerkProtectedPage({ page, url: '/account/mfa/app?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Check if the heading is visible (using default timeout)
        await expect(page.getByRole('heading', { name: 'Authenticator App Verification' })).toBeVisible()

        // Verify QR code is present
        await expect(page.locator('svg')).toBeVisible() // Basic check for QR code SVG

        // Attempt verification with an incorrect code
        await page.getByPlaceholder('000000').fill('111111')
        await page.getByRole('button', { name: 'Verify Code' }).click()
        await expect(page.getByText('Invalid Code')).toBeVisible() // Check for the specific error message

        // Attempt verification with the correct code
        await page.getByPlaceholder('000000').fill(CLERK_MFA_CODE)
        await page.getByRole('button', { name: 'Verify Code' }).click()

        // Should proceed to backup codes step
        await expect(page.getByRole('heading', { name: 'Backup Codes' })).toBeVisible()
        await expect(page.locator('ol > li > code')).toHaveCount(10) // Check for 10 backup codes

        // Finish setup
        await page.getByRole('button', { name: 'Finish' }).click()

        // Should proceed to success step
        await expect(page.getByRole('heading', { name: 'Success!' })).toBeVisible()
        await expect(page.getByText('You have successfully added TOTP MFA')).toBeVisible()

        // Return home
        await page.getByRole('link', { name: 'Return to homepage' }).click()
        await expect(page).toHaveURL('/') // Or the expected dashboard URL
    })

    test.skip('adds MFA using SMS', async ({ page }) => {
        // Visit the main MFA page, forcing the setup flow
        await visitClerkProtectedPage({ page, url: '/account/mfa?TESTING_FORCE_NO_MFA=1', role: 'member' })

        // Navigate to the SMS setup
        await page.getByRole('link', { name: 'SMS Verification' }).click()
        await expect(page.getByRole('heading', { name: 'SMS Verification' })).toBeVisible()

        // Assuming the test user doesn't have a phone number pre-filled,
        // otherwise the input would be disabled.
        const phoneInput = page.getByLabel('Phone Number')
        await expect(phoneInput).toBeEnabled()
        await phoneInput.fill('+12015550201') // Use Clerk test phone number

        // Send the verification code
        const sendCodeButton = page.getByRole('button', { name: 'Send Code' })
        await sendCodeButton.click()

        // Wait for the code to be "sent" (button updates)
        await expect(sendCodeButton).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Code Sent' })).toBeVisible() // Check button text change

        // Attempt verification with an incorrect code
        const verificationInput = page.getByLabel('Verification Code')
        await expect(verificationInput).toBeEnabled()
        await verificationInput.fill('111111')
        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await verifyButton.click()
        await expect(page.getByText('Invalid verification code. Please try again.')).toBeVisible()

        // Attempt verification with the correct code
        await verificationInput.fill(CLERK_MFA_CODE)
        await verifyButton.click()

        // Should show success and backup codes
        await expect(page.getByText('Phone number verified and enabled for MFA!')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Save Your Backup Codes' })).toBeVisible()
        await expect(page.locator('ol > li > code')).toHaveCount(10) // Check for 10 backup codes

        // Return home
        await page.getByRole('link', { name: 'Done - Return to Homepage' }).click()
        await expect(page).toHaveURL('/') // Or the expected dashboard URL
    })
})
