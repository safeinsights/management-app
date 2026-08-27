import { authFileFor, e2eSignOut, expect, goto, test } from './e2e.helpers'

// Opening the sign-in page with an active session should offer continue/switch, not error.
test.describe('sign in while already signed in', () => {
    test.use({ storageState: authFileFor('admin') })

    test('offers to continue into the app', async ({ page }) => {
        await goto(page, '/account/signin')

        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        await page.getByRole('button', { name: /^continue$/i }).click()

        await expect(page).toHaveURL(/dashboard/)
    })

    test('auto-redirects when a safe redirect_url is present', async ({ page }) => {
        await goto(page, '/account/signin?redirect_url=%2Fdashboard')

        await expect(page).toHaveURL(/dashboard/)
    })

    test('can switch to a different account', async ({ page }) => {
        await goto(page, '/account/signin')

        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        await page.getByRole('button', { name: /different account/i }).click()

        await expect(page.getByLabel('email')).toBeVisible()
        await expect(page.getByLabel('password')).toBeVisible()
    })

    // OTTER-745. Clearing the role cookie without notifying the fake's store leaves the client
    // believing it is signed in while the server sees nobody, which is the staging divergence that
    // stranded the prompt on screen with a Continue button that could only bounce off the proxy.
    test('closes the prompt once the client notices the session is gone', async ({ page }) => {
        await goto(page, '/account/signin')
        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        await e2eSignOut(page, { notifyClient: true })

        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeHidden()
        await expect(page.getByLabel('email')).toBeVisible()
        await expect(page.getByLabel('password')).toBeVisible()
    })

    test('continue leads somewhere even when the session died behind the prompt', async ({ page }) => {
        await goto(page, '/account/signin')
        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeVisible()

        // No store notification here on purpose: the client stays stale-signed-in, so Continue
        // targets the dashboard and the proxy bounces it back to signin with the captured deep link.
        await e2eSignOut(page)
        await page.getByRole('button', { name: /^continue$/i }).click()

        await expect(page).toHaveURL(/redirect_url=%2Fdashboard/)
        await expect(page.getByLabel('email')).toBeVisible()
        await expect(page.getByLabel('password')).toBeVisible()
    })
})
