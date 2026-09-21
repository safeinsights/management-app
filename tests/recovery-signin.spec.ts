import { E2E_TIMEOUT, e2eSignOut, expect, test, TestingUsers } from './e2e.helpers'

test.describe('recovery code sign in UI', async () => {
    const role = 'reviewer'
    const props = TestingUsers[role]

    test('can navigate to recovery code screen and back', async ({ page }) => {
        await page.goto('/account/signin')
        await e2eSignOut(page)

        await page.getByLabel('email').fill(props.identifier)
        await page.getByLabel('password').fill(props.password)
        await page.getByRole('button', { name: 'login' }).click()

        await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })

        const recoveryBtn = page.getByRole('button', { name: /Try recovery code/i })
        await expect(recoveryBtn).toBeVisible()
        await recoveryBtn.click()

        await expect(page.getByRole('heading', { name: /Use recovery code to sign in/i })).toBeVisible()
        await expect(page.getByLabel('Enter recovery code')).toBeVisible()

        await page.getByRole('button', { name: /Back to options/i }).click()

        await expect(page.getByRole('heading', { name: /multi-factor authentication required/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /Try recovery code/i })).toBeVisible()
    })

    test('shows error on incorrect recovery code', async ({ page }) => {
        await page.goto('/account/signin')
        await e2eSignOut(page)

        await page.getByLabel('email').fill(props.identifier)
        await page.getByLabel('password').fill(props.password)
        await page.getByRole('button', { name: 'login' }).click()

        await page.getByRole('heading', { name: /multi-factor authentication required/i }).waitFor({ state: 'visible' })

        await page.getByRole('button', { name: /Try recovery code/i }).click()

        await page.getByRole('heading', { name: /Use recovery code to sign in/i }).waitFor({ state: 'visible' })

        await page.getByLabel('Enter recovery code').fill('wrongcode123')
        await page.getByRole('button', { name: 'Sign in' }).click()

        // CI returns strategy_for_user_invalid: backup codes are not enabled for the test user.
        await expect(
            page.getByText(
                /Code is incorrect or already in use|The verification strategy is not valid for this account/i,
            ),
        ).toBeVisible({ timeout: E2E_TIMEOUT })
    })
})
