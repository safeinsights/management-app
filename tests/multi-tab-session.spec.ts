import { authFileFor, e2eRestoreSession, e2eSignOut, expect, goto, test } from './e2e.helpers'

// Clerk's signOut ends the session for every tab of the browser, so a sign-in page that signed out on
// load took the other tab with it (OTTER-388). Both pages share one context, which is what two tabs
// share: the session cookie.
test.describe('two tabs, one session', () => {
    test.use({ storageState: authFileFor('admin') })

    test('loading sign-in in a second tab keeps the first tab signed in', async ({ page }) => {
        const other = await page.context().newPage()
        await goto(page, '/dashboard')

        await goto(other, '/account/signin')
        await expect(other.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        await goto(page, '/dashboard')
        await expect(page).toHaveURL(/\/dashboard/)
        await expect(page.getByRole('heading', { name: 'My dashboard' })).toBeVisible()
    })

    test('reloading a signed-out tab after signing in elsewhere keeps the active tab signed in', async ({ page }) => {
        await goto(page, '/dashboard')
        const stale = await page.context().newPage()

        await e2eSignOut(page)
        await goto(stale, '/account/signin')
        await expect(stale.getByLabel('email')).toBeVisible()

        await e2eRestoreSession(page, 'admin')
        await goto(page, '/dashboard')
        await expect(page).toHaveURL(/\/dashboard/)

        await stale.reload()
        await stale.waitForFunction(() => window.isReactHydrated)
        await expect(stale.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        await goto(page, '/dashboard')
        await expect(page).toHaveURL(/\/dashboard/)
        await expect(page.getByRole('heading', { name: 'My dashboard' })).toBeVisible()
    })
})
