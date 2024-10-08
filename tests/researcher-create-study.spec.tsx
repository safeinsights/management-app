import { test, expect } from '@playwright/test'

test.describe('app', () => {
    test('homepage', async ({ page }) => {
        // await setupClerkTestingToken({ page });

        await page.goto('/')
        await expect(page).toHaveTitle(/SafeInsights/)
        await expect(page.getByText('Hello World')).toBeVisible()
    })
})
