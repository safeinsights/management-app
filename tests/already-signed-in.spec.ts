import { authFileFor, expect, goto, test } from './e2e.helpers'

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
})
