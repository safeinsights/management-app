import { expect, test, visitClerkProtectedPage } from './e2e.helpers'
import type { Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

// Helper function to fill the study creation form
async function fillStudyForm(page: Page, title: string) {
    await expect(page.getByText('Step 1 of 5')).toBeVisible()
    const orgSelect = page.getByTestId('org-select')
    await orgSelect.waitFor({ state: 'visible' })

    await page.waitForTimeout(1000)
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: /openstax/i }).click()

    await page.getByLabel(/title/i).fill(title)
    await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

    await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
    await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
    await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')
}

// Helper function to view study details from dashboard
async function viewDetails(page: Page, studyTitle: string) {
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await expect(studyRow).toBeVisible({ timeout: 15000 })
    await studyRow.getByRole('link', { name: 'View' }).first().click()
    await expect(
        page.getByRole('heading', { name: /Study Details|Review your submission|Review submission/i }),
    ).toBeVisible()
}

// Helper function to create and submit a study
async function createStudy(page: Page, studyTitle: string): Promise<string> {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    // Wait for dashboard to be fully loaded before interacting
    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible', timeout: 30000 })
    await newStudyButton.click()

    await fillStudyForm(page, studyTitle)

    const nextStepButton = page.getByRole('button', { name: /Save and proceed to Step 4/i })
    await expect(nextStepButton).toBeDisabled()

    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible', timeout: 10000 })
    await radioButton.click()

    await expect(nextStepButton).toBeEnabled()
    await nextStepButton.click()

    await expect(page.getByText('Step 4 of 5')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Upload your files/i }).click()

    await expect(page.getByRole('dialog')).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(['tests/assets/main.r'])

    await page.getByRole('radio', { name: 'main.r' }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible()

    await expect(page.getByRole('heading', { name: /Review uploaded files/i })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /Save and proceed to review/i }).click()

    await expect(page.getByRole('heading', { name: /Review your submission/i })).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Submit study/i }).click()

    await page.waitForURL('**/dashboard', { timeout: 15000 })

    await page.goto('/openstax-lab/dashboard')

    await expect(page.getByRole('heading', { name: 'Proposed Studies' })).toBeVisible({ timeout: 15000 })

    return studyTitle
}

test('Resubmit code flow: researcher can resubmit code for an approved study', async ({ page, studyFeatures }) => {
    // 1. Create a study (as researcher)
    await test.step('researcher creates and submits a study', async () => {
        await createStudy(page, studyFeatures.studyTitle)
        await viewDetails(page, studyFeatures.studyTitle)
    })

    // 2. Approve study (as reviewer) to change status from PENDING-REVIEW to APPROVED
    await test.step('reviewer approves the study', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        // Wait for dashboard content to be fully loaded
        await expect(page.getByText('Review Studies')).toBeVisible({ timeout: 15000 })

        await viewDetails(page, studyFeatures.studyTitle)

        await page.getByRole('button', { name: /approve/i }).click()

        await page.goto('/openstax/dashboard')

        await viewDetails(page, studyFeatures.studyTitle)

        await expect(page.getByText('Approved on')).toBeVisible()
    })

    // 3. Test that select-files page works for non-draft (approved) study
    let studyId: string
    await test.step('select-files page loads for approved (non-draft) study', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

        // Wait for dashboard content to be fully loaded
        await expect(page.getByRole('heading', { name: 'Proposed Studies' })).toBeVisible({ timeout: 15000 })

        // Find the study and navigate to its view page to get the study ID
        await viewDetails(page, studyFeatures.studyTitle)

        // Extract the study ID from the current URL
        const url = page.url()
        studyId = url.split('/study/')[1].split('/')[0]

        // Navigate directly to the select-files page
        await page.goto(`/openstax-lab/study/${studyId}/select-files`)

        // Verify the page loads without the "Study not found" error
        await expect(page.getByText('Study not found')).not.toBeVisible({ timeout: 5000 })

        // Verify page content is visible
        await expect(page.getByText('Select files to submit')).toBeVisible({ timeout: 15000 })
    })

    // 4. Test the full resubmit code flow
    // This tests the complete resubmit functionality end-to-end
    await test.step('researcher can resubmit code via resubmit page', async () => {
        // Navigate to the resubmit page
        await page.goto(`/openstax-lab/study/${studyId}/resubmit`)

        // We should now be on the resubmit page without errors
        await expect(page.getByRole('heading', { name: /Resubmit study code/i })).toBeVisible({ timeout: 15000 })

        // Upload new files using the same pattern as study creation
        await page.getByRole('button', { name: /Upload your files/i }).click()

        await expect(page.getByRole('dialog')).toBeVisible()

        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(['tests/assets/main.r'])

        await page.getByRole('radio', { name: 'main.r' }).click()
        await page.getByRole('button', { name: 'Done' }).click()

        await expect(page.getByRole('dialog')).not.toBeVisible()

        // The review uploaded files view should be shown
        await expect(page.getByRole('heading', { name: /Review uploaded files/i })).toBeVisible({ timeout: 10000 })

        // Click the resubmit button to submit the new code
        const submitButton = page.getByRole('button', { name: /Resubmit study code/i })
        await expect(submitButton).toBeEnabled()
        await submitButton.click()

        // After successful resubmission, we should be redirected to the study view page
        // and see a success notification
        await page.waitForURL('**/view', { timeout: 15000 })

        // Verify success by checking the notification or page content
        await expect(page.getByRole('heading', { name: /Study Details|Review your submission/i })).toBeVisible({
            timeout: 15000,
        })
    })
})
