import { Routes } from '@/lib/routes/definitions'
import { expect, goto, test, withRole, type Page } from './e2e.helpers'
import { seedApprovedWithPublishedStudyAgreement } from './e2e.seed'
import { RESEARCHER_DASHBOARD, REVIEWER_DASHBOARD, viewStudyDetails } from './study.helpers'

// Study-scoped, unlike the global Terms of Service, so this spec publishes its own at runtime against
// a uniquely-titled study and needs no dedicated role.

const openStudy = async (page: Page, studyTitle: string, dashboard = RESEARCHER_DASHBOARD) => {
    await goto(page, dashboard)
    await viewStudyDetails(page, studyTitle)
}

test('a study with an unacknowledged Study Agreement is blocked until it is acknowledged', async ({
    browser,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('study-agreement-gate')
    await seedApprovedWithPublishedStudyAgreement(studyTitle)

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
        await page.waitForURL(Routes.dashboard)

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

test('the Data Partner is gated by the same agreement, independently of the Research Lab', async ({
    browser,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('study-agreement-gate-dp')
    await seedApprovedWithPublishedStudyAgreement(studyTitle)

    // Acknowledgement is per user, so the lab signing first must not clear the reviewer's gate.
    await withRole(browser, 'researcher', async (page) => {
        await openStudy(page, studyTitle)
        const modal = page.getByRole('dialog').filter({ hasText: 'Study Agreement' })
        await expect(modal).toBeVisible()
        await modal.getByRole('checkbox').check()
        await modal.getByRole('button', { name: 'Continue' }).click()
        await expect(modal).toBeHidden()
    })

    await withRole(browser, 'reviewer', async (page) => {
        await openStudy(page, studyTitle, REVIEWER_DASHBOARD)

        const modal = page.getByRole('dialog').filter({ hasText: 'Study Agreement' })
        await expect(modal).toBeVisible()

        const continueButton = modal.getByRole('button', { name: 'Continue' })
        await expect(continueButton).toBeDisabled()

        await modal.getByRole('checkbox').check()
        await expect(continueButton).toBeEnabled()
        await continueButton.click()

        await expect(modal).toBeHidden()

        await openStudy(page, studyTitle, REVIEWER_DASHBOARD)
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
