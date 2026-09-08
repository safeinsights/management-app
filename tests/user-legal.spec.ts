import { authFileFor, expect, test, visitAsRole } from './e2e.helpers'
import { SEEDED_TOS_V2_BODY } from './e2e.seed'

// Any role but `legal`, whose user is left owing ToS v2 and meets a blocking modal on every page.
test.use({ storageState: authFileFor('reviewer') })

const TAB_NAMES = [
    'Study Agreements',
    'Data Organization Participation Agreements',
    'Research Organization Participation Agreements',
    'Terms of Service',
    'Privacy Notice',
]

// Study agreement rows are not asserted: nothing acknowledges an SLA yet.
test.describe('Personal legal page', () => {
    test('a user reaches their legal page from the profile menu and reads the terms they signed', async ({ page }) => {
        await visitAsRole(page, '/dashboard')

        await page.getByRole('button', { name: 'Toggle profile menu' }).click()
        await page.getByRole('menuitem', { name: 'Legal' }).click()

        await expect(page).toHaveURL(/\/legal$/)
        await expect(page.getByRole('heading', { name: 'Legal', exact: true })).toBeVisible()

        for (const name of TAB_NAMES) {
            await expect(page.getByRole('tab', { name })).toBeVisible()
        }

        await page.getByRole('tab', { name: 'Terms of Service' }).click()

        // The seeded reviewer is acked at the latest version, so this shows v2's body and a real date.
        await expect(page.getByText(SEEDED_TOS_V2_BODY)).toBeVisible()
        await expect(page.getByText(/^Acknowledged on: \w{3} \d{2}, \d{4}$/)).toBeVisible()
    })

    test('the privacy notice panel renders its own document', async ({ page }) => {
        await visitAsRole(page, '/legal')

        await page.getByRole('tab', { name: 'Privacy Notice' }).click()

        await expect(page.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible()
        await expect(page.getByText('Version 1. Seeded for end-to-end tests.')).toBeVisible()
    })
})
