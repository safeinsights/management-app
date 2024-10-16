import { test, expect } from '@playwright/test'
import { visitClerkProtectedPage } from './helpers'

test.describe('app', () => {
    test('researcher creates a study', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })

        const testTitle = 'A E2E Test Study'
        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /study proposal/i }).click()

        await page.getByLabel(/title/i).fill(testTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')
        await page.getByLabel(/description/i).fill('this study will cement my legacy as the greatest researcher')
        await page.getByRole('button', { name: /proceed/i }).click()

        await expect(page.getByText('containerize and upload')).toBeVisible()

        await page.getByRole('button', { name: /proceed/i }).click()

        await expect(page.getByTestId('study-title')).toHaveValue(testTitle)

        await page.getByRole('checkbox', { name: /highhlights/i }).check()

        await page.getByRole('button', { name: /update/i }).click()

        await page.getByRole('button', { name: /all studies/i }).click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByText(testTitle).first()).toBeVisible()
    })
})
