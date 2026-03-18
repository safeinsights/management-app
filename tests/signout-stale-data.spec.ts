import { expect, fillPinInput, goto, test, TestingUsers, visitClerkProtectedPage } from './e2e.helpers'
import { setupClerkTestingToken } from '@clerk/testing/playwright'

const signOutViaMenu = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click()
    const signOutBtn = page.getByRole('menuitem', { name: 'Sign Out' })
    await expect(signOutBtn).toBeVisible()
    // force:true bypasses the Collapse animation stability check
    await signOutBtn.click({ force: true })
    // Wait for the hard redirect (window.location.assign) to land on the sign-in page.
    // Clerk's signOut() API call runs before the redirect fires, so give it plenty of room.
    await page.waitForURL('**/account/signin**', { timeout: 15000 })
}

test.describe('sign-out hard redirect', () => {
    test('hard redirect on sign-out destroys previous session state', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        // Plant a marker in the JS heap to detect whether a hard navigation occurs
        await page.evaluate(() => {
            ;(window as unknown as Record<string, unknown>).__signOutTestMarker = true
        })

        await signOutViaMenu(page)

        // Sign-out should preserve the current page in redirect_url
        expect(page.url()).toContain('redirect_url=%2F')

        // After the hard redirect, the JS context is fresh — the marker is gone
        const markerSurvived = await page.evaluate(
            () => (window as unknown as Record<string, unknown>).__signOutTestMarker,
        )
        expect(markerSurvived).toBeFalsy()
    })

    test('redirect_url parameter redirects user back after sign-in', async ({ page }) => {
        const creds = TestingUsers.researcher

        await setupClerkTestingToken({ page })
        await goto(page, '/account/signin?redirect_url=/dashboard')

        await page.getByLabel('email').fill(creds.identifier)
        await page.getByLabel('password').fill(creds.password)
        await page.getByRole('button', { name: 'login' }).click()

        await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })
        await page.getByRole('button', { name: 'SMS Verification' }).click()

        await page.getByRole('heading', { name: /verify your code/i }).waitFor({ state: 'visible' })
        await fillPinInput(page, creds.mfa, 'sms-pin-input')
        await page.getByRole('button', { name: 'Verify code' }).click()

        await page.waitForURL('**/dashboard', { timeout: 15000 })
        expect(page.url()).toContain('/dashboard')
    })

    test('signing in as a different user after sign-out shows fresh data', async ({ page }) => {
        // Sign in as researcher
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        await signOutViaMenu(page)

        // Sign in as a different user and verify they see their own data
        await visitClerkProtectedPage({ page, url: '/', role: 'admin' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        const currentEmail = await page.evaluate(() => window.Clerk?.user?.primaryEmailAddress?.emailAddress)
        expect(currentEmail).toBe(TestingUsers.admin.identifier)
    })
})
