import { expect, test, TestingUsers, visitClerkProtectedPage } from './e2e.helpers'

const signOutViaMenu = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click()
    const signOutBtn = page.getByRole('menuitem', { name: 'Sign Out' })
    await expect(signOutBtn).toBeVisible()
    // force:true bypasses the Collapse animation stability check
    await signOutBtn.click({ force: true })
    // Wait for the hard redirect to fully complete — the sign-in page renders the Login button
    // once all navigations (Clerk soft redirect + our window.location.assign) have settled
    await page.getByRole('button', { name: 'Login' }).waitFor({ state: 'visible', timeout: 15000 })
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

        // After the hard redirect, the JS context is fresh — the marker is gone
        const markerSurvived = await page.evaluate(
            () => (window as unknown as Record<string, unknown>).__signOutTestMarker,
        )
        expect(markerSurvived).toBeFalsy()
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
