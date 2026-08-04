import { authFileFor, expect, path, test, visitAsRole } from './e2e.helpers'
import { fileURLToPath } from 'url'

// The Legal page is SI-admin only; the `admin` role is a member of the safe-insights org.
test.use({ storageState: authFileFor('admin') })

// Spelled out rather than imported from Routes: that barrel pulls in next/navigation, which
// Playwright's loader cannot resolve, and importing it fails the whole suite at collection.
const LEGAL_PAGE = '/admin/safeinsights/legal'
const SIGNATORY = 'Single-Lang R Enclave'
const SIGNED_ON = '2026-08-03'

const pdfFixture = () => {
    const __filename = fileURLToPath(import.meta.url)
    return path.join(path.dirname(__filename), 'assets', 'empty.pdf')
}

test.describe('SafeInsights Legal', () => {
    // Publishing is irreversible and orgs are seeded rather than created per test, so this asserts
    // that a version was added — never that it is version 1, which only holds on a clean database.
    test('an SI admin can publish a signed DOPA for a Data Partner', async ({ page }) => {
        await visitAsRole(page, LEGAL_PAGE)

        await page.getByRole('tab', { name: 'DOPA' }).click()

        const row = page.getByRole('row', { name: new RegExp(SIGNATORY) })
        await expect(row).toBeVisible()

        const versionCell = row.getByRole('cell').nth(1)
        const versionBefore = ((await versionCell.textContent()) ?? '').trim()

        await row.getByRole('button', { name: /^upload/i }).click()

        await expect(page.getByLabel('Signed on')).toBeVisible()
        await page.getByLabel('Signed on').fill(SIGNED_ON)
        await page.locator('input[type="file"]').setInputFiles(pdfFixture())

        await page.getByRole('button', { name: 'Publish' }).click()

        // The card asks for a second, separate confirmation before anything is written.
        const confirmation = page.getByRole('dialog').filter({ hasText: 'Publish this file?' })
        await expect(confirmation).toBeVisible()
        await expect(confirmation.getByText(SIGNATORY)).toBeVisible()
        await confirmation.getByRole('button', { name: 'Yes, publish' }).click()

        await expect(versionCell).not.toHaveText(versionBefore)
        await expect(row.getByText(SIGNED_ON)).toBeVisible()
        await expect(row.getByRole('link', { name: 'View PDF' })).toBeVisible()

        await row.getByRole('button', { name: 'Version History' }).click()
        const history = page.getByRole('dialog').filter({ hasText: 'Published by' })
        await expect(history.getByText(SIGNED_ON).first()).toBeVisible()
    })
})
