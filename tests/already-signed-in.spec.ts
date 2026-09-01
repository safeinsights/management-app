import { BOUNCE_PARAM, BOUNCE_VALUE } from '@/lib/signin-bounce'
import { authFileFor, e2eSignOut, expect, goto, test } from './e2e.helpers'

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

    // OTTER-745: the other way this page used to stick. The automatic move leaves through a full
    // page load, so the bounced document arrives as a fresh mount and would move again, holding a
    // loading indicator and reloading itself once per pass. The mark on the URL the proxy sends
    // back is what ends that, and the count below is the assertion that matters: one refusal, not
    // a stream of them.
    //
    // The refusal is served from the test rather than by the proxy on purpose. In the fake, client
    // and server both read the role cookie, so they agree at every page load and the divergence
    // cannot be made by signing out; keeping the cookie and answering the target the way
    // src/proxy.ts does when it sees no session reproduces it exactly.
    test('the automatic redirect stops after the proxy refuses it once', async ({ page }) => {
        const refusedTo = `/account/signin?redirect_url=%2Fdashboard&${BOUNCE_PARAM}=${BOUNCE_VALUE}`
        let refusals = 0

        await page.route('**/dashboard', async (route) => {
            if (route.request().resourceType() !== 'document') return route.continue()
            refusals += 1
            await route.fulfill({ status: 307, headers: { location: refusedTo } })
        })

        await goto(page, '/account/signin?redirect_url=%2Fdashboard')

        await expect(page.getByLabel('email')).toBeVisible()
        await expect(page.getByLabel('password')).toBeVisible()
        await expect(page.getByRole('heading', { name: /already signed in/i })).toBeHidden()
        await expect(page).toHaveURL(new RegExp(`${BOUNCE_PARAM}=${BOUNCE_VALUE}`))
        expect(refusals).toBe(1)
    })
})
