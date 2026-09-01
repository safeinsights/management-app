import { authFileFor, expect, test, visitAsRole } from './e2e.helpers'
import { SEEDED_TOS_V2_BODY } from './e2e.seed'

// The `legal` role is exclusive to this spec: ToS gates every page, so borrowing another
// role's user would block it in a parallel worker.
test.use({ storageState: authFileFor('legal') })

const DASHBOARD = '/dashboard'

test.describe('Terms of Service acknowledgement', () => {
    test('a user owing an updated Terms of Service must acknowledge it before continuing', async ({ page }) => {
        await visitAsRole(page, DASHBOARD)

        const modal = page.getByRole('dialog').filter({ hasText: 'The Terms of Service has been updated' })
        await expect(modal).toBeVisible()

        await expect(modal.getByText(SEEDED_TOS_V2_BODY)).toBeVisible()

        // The Privacy Notice is already acknowledged, so it is not dragged into this prompt.
        await expect(modal.getByText('Privacy Notice')).toBeHidden()

        const continueButton = modal.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()
        // The modal covers the nav, so signing out is the only way to decline.
        await expect(modal.getByRole('button', { name: 'Sign out' })).toBeVisible()

        await modal.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(modal).toBeHidden()

        await visitAsRole(page, DASHBOARD)
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
