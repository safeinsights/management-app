import { test, expect } from '@playwright/test'

test.describe('app', () => {
    test('researcher creates a study', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /study proposal/ }).click()

        // form has an aria-label which playwright will use over the visible label
        await page.getByLabel(/study name/i).fill('Test Proposal')
        await page.getByRole('button', { name: /begin/i }).click()

        await expect(page.getByText('Approved')).toBeVisible()
    })
})
