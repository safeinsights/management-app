import { clerk, expect, test, TestingUsers } from './e2e.helpers'

test.describe('recovery code sign in UI', async () => {
    // We use a fixed role for this test
    const role = 'reviewer'
    const props = TestingUsers[role]

    test('can navigate to recovery code screen and back', async ({ page }) => {
        await page.goto('/account/signin')
        await clerk.signOut({ page })

        // 1. Initial sign in
        await page.getByLabel('email').fill(props.identifier)
        await page.getByLabel('password').fill(props.password)
        await page.getByRole('button', { name: 'login' }).click()

        // 2. Wait for MFA challenge
        await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })

        // 3. Click "Try recovery code"
        const recoveryBtn = page.getByRole('button', { name: /Try recovery code/i })
        await expect(recoveryBtn).toBeVisible()
        await recoveryBtn.click()

        // 4. Verify Recovery Code UI
        await expect(page.getByRole('heading', { name: /Use recovery code to sign in/i })).toBeVisible()
        await expect(page.getByLabel('Enter recovery code')).toBeVisible()

        // 5. Go back
        await page.getByRole('button', { name: /Back to options/i }).click()

        // Should see MFA options again
        await expect(page.getByRole('heading', { name: /multi-factor authentication required/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /Try recovery code/i })).toBeVisible()
    })

    test('shows error on incorrect recovery code', async ({ page }) => {
        // CI-only failure: we want actionable logs when the expected error text never appears.
        // Keep logs lightweight to avoid drowning CI output.
        page.on('console', (msg) => {
            const type = msg.type()
            if (type === 'error' || type === 'warning') {
                console.log(`[browser:${type}] ${msg.text()}`)
            }
        })

        // Clerk errors often surface only via network responses; in CI this can differ (rate limits, env drift, etc).
        // Log the *first* failed Clerk-ish response body to identify the error code.
        let loggedClerkFailure = false
        page.on('response', async (resp) => {
            if (loggedClerkFailure) return
            const status = resp.status()
            if (status < 400) return

            const url = resp.url()
            const looksLikeClerk = /clerk|sign_ins|sessions|second_factor|backup_code/i.test(url)
            if (!looksLikeClerk) return

            loggedClerkFailure = true
            console.log('[e2e][recovery-signin] failed response:', status, url)
            try {
                const contentType = resp.headers()['content-type']
                const bodyText = await resp.text()
                console.log('[e2e][recovery-signin] failed response content-type:', contentType)
                console.log(
                    '[e2e][recovery-signin] failed response body (first 2000 chars):',
                    JSON.stringify(bodyText.slice(0, 2000)),
                )
            } catch (e) {
                console.log('[e2e][recovery-signin] failed response body: <unreadable>', String(e))
            }
        })

        await page.goto('/account/signin')
        await clerk.signOut({ page })

        await page.getByLabel('email').fill(props.identifier)
        await page.getByLabel('password').fill(props.password)
        await page.getByRole('button', { name: 'login' }).click()

        // Wait for MFA challenge page to fully load (matches pattern in test above)
        await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })

        await page.getByRole('button', { name: /Try recovery code/i }).click()

        // Wait for Recovery Code UI to appear
        await page.getByRole('heading', { name: /Use recovery code to sign in/i }).waitFor({ state: 'visible' })

        await page.getByLabel('Enter recovery code').fill('wrongcode123')
        await page.getByRole('button', { name: 'Sign in' }).click()

        // Wait for the error message to appear (with extended timeout for slow CI)
        try {
            await expect(page.getByText(/Code is incorrect or already in use/i)).toBeVisible({ timeout: 15000 })
        } catch (err) {
            // Diagnostics to explain CI-only mismatch.
            const url = page.url()
            const alerts = await page
                .locator('[role="alert"]')
                .allInnerTexts()
                .catch(() => [])

            // Try a few likely containers first to keep output small.
            const formText = await page
                .locator('form')
                .innerText()
                .catch(() => null)
            const bodyText = await page
                .locator('body')
                .innerText()
                .catch(() => null)

            console.log('[e2e][recovery-signin] expected recovery-code error text not found')
            console.log('[e2e][recovery-signin] url:', url)
            if (alerts.length) console.log('[e2e][recovery-signin] role=alert texts:', JSON.stringify(alerts))
            const snippet = (formText || bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 500)
            console.log('[e2e][recovery-signin] page text snippet:', JSON.stringify(snippet))
            throw err
        }
    })
})
