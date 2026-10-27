import { authFileFor, expect, goto, test, TestingUsers, visitAsRole } from './e2e.helpers'
import { testPublicKeyFingerprint, userPublicKeyFingerprint } from './e2e.seed'

// The account pages outside the study flows: signing out, the security key, and a password reset.

test.describe('signed in', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('Signing out from the account menu ends the session', async ({ page }) => {
        await visitAsRole(page, '/dashboard')
        await page.getByRole('button', { name: 'Toggle profile menu' }).click()
        await page.getByRole('button', { name: 'Log out' }).click()
        await page.waitForURL(/\/account\/signin/)

        // Gone for good: a protected page bounces back to sign-in.
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await page.waitForURL(/\/account\/signin/)
    })

    // Backs out at the last step on purpose: every decrypt flow in the suite opens outputs with the
    // fixture key, and global setup would only restore it on the next run.
    test('Regenerating a security key is confirmed before anything changes', async ({ page }) => {
        await visitAsRole(page, '/user-key')
        await expect(page.getByRole('heading', { name: 'Existing security key', level: 2 })).toBeVisible()
        await expect(page.getByText(/You generated a security key on/)).toBeVisible()
        await page.getByRole('button', { name: 'Generate new key' }).click()
        const resetDialog = page.getByRole('dialog', { name: 'Confirm key reset' })
        await resetDialog.getByRole('button', { name: 'Generate new key' }).click()
        await page.waitForURL(/\/account\/keys/)

        // The replacement is minted in the browser and shown once; Next asks for a final confirmation.
        await expect(page.getByRole('heading', { name: 'New security key' })).toBeVisible()
        await expect(page.getByText(/-----BEGIN PRIVATE KEY-----/)).toBeVisible()
        await page.getByRole('button', { name: 'Copy key' }).click()
        await page.getByRole('button', { name: 'Next' }).click()
        const confirm = page.getByRole('dialog', { name: 'Confirm key reset' })
        await expect(confirm.getByRole('button', { name: 'Yes, replace my key' })).toBeVisible()
        await confirm.getByRole('button', { name: 'Back' }).click()
        await expect(confirm).toBeHidden()
        expect(await userPublicKeyFingerprint('reviewer')).toBe(testPublicKeyFingerprint())
    })
})

test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('A user resets their password and is signed in', async ({ page }) => {
        await goto(page, '/account/reset-password')
        await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
        await page.getByRole('textbox', { name: 'Email' }).fill(TestingUsers.researcher.identifier)
        await page.getByRole('button', { name: 'Send Verification Code' }).click()
        const dialog = page.getByRole('dialog', { name: 'Account verification' })
        await dialog.getByRole('button', { name: 'Enter verification code' }).click()

        // The fake's reset flow carries the account identity only after a resend (a limit of the fake,
        // src/lib/clerk-fake/sign-in-resource.ts, not of the app); a real user may well resend too.
        await page.getByText('Resend verification code').click()
        await page.getByRole('textbox', { name: 'Verification code' }).fill('424242')
        await page.getByLabel('New password', { exact: true }).fill('TestPass1*')
        await page.getByLabel('Confirm New password', { exact: true }).fill('TestPass1*')
        await page.getByRole('button', { name: 'Update password' }).click()
        await page.waitForURL('/dashboard')
        await expect(page.getByRole('link', { name: 'My studies', exact: true })).toBeVisible()
    })
})
