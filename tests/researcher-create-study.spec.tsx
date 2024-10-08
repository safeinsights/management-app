import { test, expect } from '@playwright/test'

test.describe('app', () => {
    test('researcher creates a study', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /study proposal/ }).click()

        await page.getByLabel(/title/i).fill('Test Proposal')
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')
        await page.getByLabel(/description/i).fill('this study will cement my legacy as the greatest researcher')
        await page.getByRole('button', { name: /begin/i }).click()

        await expect(page.getByText('Approved')).toBeVisible()
    })
})
