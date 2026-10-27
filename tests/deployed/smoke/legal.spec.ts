import { expect, test } from '../fixtures'

// The personal legal page reads the published documents this account has acknowledged.

test("the legal page lists the account's documents", async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await page.goto('/legal', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('tab', { name: 'Study Agreement' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Terms of Service' })).toBeVisible()
})
