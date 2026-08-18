import { expect, goto, test, withRole, type Page } from './e2e.helpers'
import { seedApprovedWithPublishedSla } from './e2e.seed'

// A Study Agreement is scoped to one study, unlike the global Terms of Service, so this spec
// publishes its own at runtime against a uniquely-titled study. That reaches no other worker's user,
// which is why no dedicated role is needed here.

const RESEARCHER_DASHBOARD = '/openstax-lab/dashboard'

const openStudy = async (page: Page, studyTitle: string) => {
    await goto(page, RESEARCHER_DASHBOARD)
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await studyRow.getByRole('link', { name: 'View' }).first().click()
    }).toPass()
    await page.waitForURL(/\/study\//)
}

test('a study with an unacknowledged Study Agreement is blocked until it is acknowledged', async ({
    browser,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('sla-gate')
    await seedApprovedWithPublishedSla(studyTitle)

    await withRole(browser, 'researcher', async (page) => {
        await openStudy(page, studyTitle)

        const modal = page.getByRole('dialog').filter({ hasText: 'Study Agreement' })
        await expect(modal).toBeVisible()

        // The agreement is a PDF, so the modal links out rather than rendering it inline.
        await expect(modal.getByRole('link', { name: /Study Agreement/ })).toHaveAttribute('target', '_blank')

        const continueButton = modal.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()

        // Declining has to lead somewhere: the modal covers the nav.
        await modal.getByRole('button', { name: 'Cancel' }).click()
        await page.waitForURL(/\/dashboard/)

        // Cancelling settles nothing — re-entering asks again.
        await openStudy(page, studyTitle)
        await expect(modal).toBeVisible()

        await modal.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(modal).toBeHidden()

        // Acknowledged for good: the gate covers every route of the study, so it must not reappear.
        await openStudy(page, studyTitle)
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
