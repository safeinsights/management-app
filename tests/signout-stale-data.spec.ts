import { expect, test, TestingUsers, visitClerkProtectedPage } from './e2e.helpers'

const signOutViaMenu = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click()
    const signOutBtn = page.getByRole('menuitem', { name: 'Sign Out' })
    await expect(signOutBtn).toBeVisible()
    // force:true bypasses the Collapse animation stability check
    await signOutBtn.click({ force: true })
    await page.waitForURL('**/account/signin**', { timeout: 15000 })
}

test.describe('sign-out hard redirect', () => {
    test('hard redirect on sign-out destroys previous session state', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        // Plant a marker in the JS heap to detect whether a hard navigation occurs
        await page.evaluate(() => {
            ;(window as any).__signOutTestMarker = true
        })

        await signOutViaMenu(page)

        // If sign-out performed a hard navigation (window.location.href),
        // the JS context is destroyed and the marker will be undefined
        const markerSurvived = await page.evaluate(() => (window as any).__signOutTestMarker)
        expect(markerSurvived).toBeFalsy()
    })

    test('signing in as a different user after sign-out shows fresh data', async ({ page }) => {
        // Sign in as researcher
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        // Plant a cache marker to simulate stale in-memory state
        await page.evaluate(() => {
            ;(window as any).__cachedUserRole = 'researcher'
        })

        await signOutViaMenu(page)

        // Check the marker immediately after signout (before any page.goto)
        // A hard redirect would have destroyed it
        const staleRole = await page.evaluate(() => (window as any).__cachedUserRole)
        expect(staleRole).toBeUndefined()

        // Also verify we can sign in as a different user successfully
        await visitClerkProtectedPage({ page, url: '/', role: 'admin' })
        await expect(page.locator('text=dashboard').first()).toBeVisible({ timeout: 15000 })

        const currentEmail = await page.evaluate(
            () => window.Clerk?.user?.primaryEmailAddress?.emailAddress,
        )
        expect(currentEmail).toBe(TestingUsers.admin.identifier)
    })
})
