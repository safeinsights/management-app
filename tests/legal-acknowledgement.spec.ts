import { authFileFor, expect, test, visitAsRole } from './e2e.helpers'

// The `legal` role exists for this spec alone. Terms of Service and Privacy Notice are globally
// scoped, so a user who owes one is blocked on every page — borrowing another role's user would
// block whatever else that role is doing in a parallel worker. Its acknowledgement state (acked at
// ToS v1, owing v2) is set once by tests/global.setup.ts, never published from inside a test.
test.use({ storageState: authFileFor('legal') })

const DASHBOARD = '/dashboard'
const UPDATED_TOS_BODY = 'This version supersedes v1.'

test.describe('Terms of Service acknowledgement', () => {
    test('a user owing an updated Terms of Service must acknowledge it before continuing', async ({ page }) => {
        await visitAsRole(page, DASHBOARD)

        const modal = page.getByRole('dialog').filter({ hasText: 'The Terms of Service has been updated' })
        await expect(modal).toBeVisible()

        // The document itself is in the modal, not behind a link — there is nowhere else to read it.
        await expect(modal.getByText(UPDATED_TOS_BODY)).toBeVisible()

        // The Privacy Notice is already acknowledged, so it is not dragged into this prompt.
        await expect(modal.getByText('Privacy Notice')).toBeHidden()

        const continueButton = modal.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()
        // Declining has to remain possible: the modal covers the nav, so this is the only way out.
        await expect(modal.getByRole('button', { name: 'Sign out' })).toBeVisible()

        await modal.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(modal).toBeHidden()

        // Acknowledged for good: the gate runs on every page, so it must not reappear on the next one.
        await visitAsRole(page, DASHBOARD)
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
