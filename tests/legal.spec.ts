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
    // that the agreement is present afterwards — never that it is version 1, which only holds on a
    // clean database.
    test('an SI admin can publish a signed DOPA for a Data Partner', async ({ page }) => {
        await visitAsRole(page, LEGAL_PAGE)

        await page.getByRole('tab', { name: 'DOPA' }).click()

        // The table lists agreements, not orgs, so the org is chosen in the upload modal.
        await page.getByRole('button', { name: 'Upload', exact: true }).click()

        await page.getByPlaceholder('Select a Data Partner').click()
        await page.getByRole('option', { name: SIGNATORY }).click()

        await page.getByLabel('Signed on').fill(SIGNED_ON)
        await page.locator('input[type="file"]').setInputFiles(pdfFixture())

        // Exact: 'Publish' would also substring-match the confirmation's 'Yes, publish'.
        await page.getByRole('button', { name: 'Publish', exact: true }).click()

        // The card asks for a second, separate confirmation before anything is written.
        const confirmation = page.getByRole('dialog').filter({ hasText: 'Publish this file?' })
        await expect(confirmation).toBeVisible()
        // Exact, because the org is named twice: once as the read-back field and again inside the
        // sentence naming who has to acknowledge.
        await expect(confirmation.getByText(SIGNATORY, { exact: true })).toBeVisible()
        // Publishing obligates people, so the confirmation has to say who.
        await expect(confirmation.getByText(`all members of ${SIGNATORY}`)).toBeVisible()
        await confirmation.getByRole('button', { name: 'Yes, publish' }).click()

        const row = page.getByRole('row', { name: new RegExp(SIGNATORY) })
        await expect(row).toBeVisible()
        await expect(row.getByText(SIGNED_ON)).toBeVisible()
        await expect(row.getByRole('link', { name: 'View PDF' })).toBeVisible()

        await row.getByRole('button', { name: 'Version History' }).click()
        const history = page.getByRole('dialog').filter({ hasText: 'Published by' })
        await expect(history.getByText(SIGNED_ON).first()).toBeVisible()
    })
})
