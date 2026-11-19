import { expectNoA11yViolations } from './a11y.helpers'
import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, test, visitAsRole } from './e2e.helpers'
import { SEEDED_TOS_V2_BODY } from './e2e.seed'

// The `legal` role is exclusive to this spec: ToS gates every page, so borrowing another
// role's user would block it in a parallel worker.
test.use({ storageState: authFileFor('legal') })

test.describe('Terms of Service acknowledgement', () => {
    test('a user owing an updated Terms of Service acknowledges it on its own page before reaching the app', async ({
        page,
    }) => {
        await visitAsRole(page, Routes.support)
        await expect(page).toHaveURL(
            (url) =>
                url.pathname === Routes.accountAgreements && url.searchParams.get('redirect_url') === Routes.support,
        )

        const step = page.getByRole('main')
        await expect(step.getByRole('heading', { level: 1, name: 'Welcome to SafeInsights!' })).toBeVisible()
        await expect(step.getByText(/We have updated our Terms of Service/)).toBeVisible()
        // No app chrome: the account bar is the top nav every app page carries.
        await expect(page.getByRole('navigation', { name: 'Account' })).toBeHidden()

        await expectNoA11yViolations(page, 'Terms of Service acknowledgement step')

        // Linked, not embedded: the document opens on its own public page.
        await expect(step.getByText(SEEDED_TOS_V2_BODY)).toBeHidden()
        const link = step.getByRole('link', { name: /^Terms of Service/ })
        await expect(link).toHaveAttribute('href', Routes.termsOfService)
        await expect(link).toHaveAttribute('target', '_blank')

        // The Privacy Notice is already acknowledged, so it is not dragged into this prompt.
        await expect(step.getByText('Privacy Notice')).toBeHidden()

        const continueButton = step.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()
        await expect(step.getByRole('button', { name: 'Sign out' })).toBeHidden()

        await step.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(page).toHaveURL((url) => url.pathname === Routes.support)
        await expect(page.getByRole('navigation', { name: 'Account' })).toBeVisible()

        await visitAsRole(page, Routes.dashboard)
        await expect(page).toHaveURL((url) => url.pathname === Routes.dashboard)
    })
})
