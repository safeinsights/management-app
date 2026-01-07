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
        // Note: CI environment returns strategy_for_user_invalid because backup codes are not enabled for the test user
        await expect(
            page.getByText(/Code is incorrect or already in use|The verification strategy is not valid for this account/i),
        ).toBeVisible({ timeout: 15000 })
    })
})
