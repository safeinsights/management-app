import { authFileFor, expect, test, visitAsRole, Page } from './e2e.helpers'

test.describe('MFA Setup Visibility', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('renders the sms and authenticator buttons', async ({ page }) => {
        await visitAsRole(page, '/account/mfa?TESTING_FORCE_NO_MFA=1')
        await expect(page.getByRole('link', { name: 'SMS Verification' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Authenticator app verification' })).toBeVisible()
    })

    test('checks Authenticator App page elements', async ({ page }) => {
        await visitAsRole(page, '/account/mfa/app?TESTING_FORCE_NO_MFA=1')

        const verifyButton = page.getByRole('button', { name: 'Verify Code' })
        await expect(verifyButton).toBeVisible()
        await expect(verifyButton).toBeDisabled()
    })

    test('checks SMS page elements', async ({ page }) => {
        async function fillPinInput(page: Page, pinInputTestId: string, pinCode: string) {
            const pinInputLocator = page.locator(`[data-testid="${pinInputTestId}"]`)
            const firstPinInput = pinInputLocator.locator('input').first()

            await firstPinInput.focus()
            await page.keyboard.type(pinCode)
        }
        async function testPinInput(page: Page, pinInputTestId: string, pinCode: string, expectedValues: string[]) {
            await fillPinInput(page, pinInputTestId, pinCode)

            const pinInputLocator = page.locator(`[data-testid="${pinInputTestId}"]`)
            const inputs = pinInputLocator.locator('input')

            for (let i = 0; i < expectedValues.length; i++) {
                await expect(inputs.nth(i)).toHaveValue(expectedValues[i])
            }
        }
        await visitAsRole(page, '/account/mfa/sms?TESTING_FORCE_NO_MFA=1')

        await page.getByPlaceholder('Enter phone number').fill('+15555550101')
        await page.getByRole('button', { name: /send verification code/i }).click()

        await testPinInput(page, 'sms-pin-input', '424242', ['4', '2', '4', '2', '4', '2'])
    })
})
