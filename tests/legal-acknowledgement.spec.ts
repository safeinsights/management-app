import { expectNoA11yViolations } from './a11y.helpers'
import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, test, visitAsRole } from './e2e.helpers'
import { SEEDED_TOS_V2_BODY } from './e2e.seed'

// The `legal` role is exclusive to this spec: ToS gates every page, so borrowing another
// role's user would block it in a parallel worker.
test.use({ storageState: authFileFor('legal') })

test.describe('Terms of Service acknowledgement', () => {
    test('a user owing an updated Terms of Service must acknowledge it before continuing', async ({ page }) => {
        await visitAsRole(page, Routes.dashboard)

        const modal = page.getByRole('dialog', { name: 'Welcome to SafeInsights!' })
        await expect(modal).toBeVisible()
        await expect(modal.getByText(/We have updated our Terms of Service/)).toBeVisible()

        // Scoped to the modal: nothing waits for the page behind it, which the a11y spec covers.
        await expectNoA11yViolations(page, 'Terms of Service update modal', { include: '[role="dialog"]' })

        // Linked, not embedded: the document opens on its own /legal tab.
        await expect(modal.getByText(SEEDED_TOS_V2_BODY)).toBeHidden()
        const link = modal.getByRole('link', { name: /^Terms of Service/ })
        await expect(link).toHaveAttribute('href', `${Routes.legal}?tab=TOS`)
        await expect(link).toHaveAttribute('target', '_blank')

        // The Privacy Notice is already acknowledged, so it is not dragged into this prompt.
        await expect(modal.getByText('Privacy Notice')).toBeHidden()

        const continueButton = modal.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()
        await expect(modal.getByRole('button', { name: 'Sign out' })).toBeHidden()

        await modal.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(modal).toBeHidden()

        await visitAsRole(page, Routes.dashboard)
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
