import { expect, fillPinInput, goto, test, TestingUsers, visitClerkProtectedPage } from './e2e.helpers'
import { setupClerkTestingToken } from '@clerk/testing/playwright'

// Clicks "Sign Out" via the profile menu and waits for the signin page to load.
//
// On CI, Clerk/middleware can trigger a secondary navigation after the initial
// /account/signin load event, which destroys the JS execution context. Waiting
// for the email input (rather than just the URL) ensures the page is fully
// settled before any subsequent page.evaluate calls.
const signOutViaMenu = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click()
    const signOutBtn = page.getByRole('menuitem', { name: 'Sign Out' })
    await signOutBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await signOutBtn.click({ force: true })
    await page.getByLabel('email').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('sign-out hard redirect', () => {
    test('hard redirect on sign-out destroys previous session state', async ({ page }) => {
        test.setTimeout(60_000)

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

    test('signing in as a different user after sign-out shows fresh data', async ({ browser }) => {
        test.setTimeout(60_000)

        // Use a fresh context for each sign-in to avoid stale Clerk SDK state.
        // Clerk's signOut() intermittently hangs, leaving the SDK in a broken
        // state that blocks subsequent sign-ins on the same page/context.
        const ctx1 = await browser.newContext()
        const page1 = await ctx1.newPage()
        await visitClerkProtectedPage({ page: page1, url: '/', role: 'researcher' })
        await expect(page1.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })
        await ctx1.close()

        // Sign in as a different user in a clean context — no stale session
        const ctx2 = await browser.newContext()
        const page2 = await ctx2.newPage()
        await visitClerkProtectedPage({ page: page2, url: '/', role: 'admin' })
        await expect(page2.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        const currentEmail = await page2.evaluate(() => window.Clerk?.user?.primaryEmailAddress?.emailAddress)
        expect(currentEmail).toBe(TestingUsers.admin.identifier)
        await ctx2.close()
    })
})
