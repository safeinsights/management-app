import type { APIRequestContext } from '@playwright/test'
import { expect, readTestSupportFile, test, visitAsRole, withRole } from './e2e.helpers'
import { jobStatusRows, seedCodeApprovedJobReady } from './e2e.seed'
import { createEnclaveClient } from './api/enclave-client'
import { RESEARCHER_DASHBOARD, viewStudyDetails } from './flows/dashboard.flows'
import { reviewerDecryptsAvailableOutputs, reviewerSharesOutputs } from './flows/outputs.flows'

async function uploadResults(request: APIRequestContext, jobId: string) {
    const response = await createEnclaveClient(request).uploadResults(jobId, {
        resultFile: 'tests/assets/safe-results.csv',
    })
    expect(response.status(), await response.text()).toBe(200)
}

// Owns the reviewer's "Share feedback only" decision (FILES-REJECTED) and the researcher's feedback
// screen it leads to: feedback without files, no key to enter, and the pill that turns once read.
test('Reviewer shares feedback only and the researcher reads it', async ({ browser, request, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('feedback-only')
    const privateKey = await readTestSupportFile('private_key.pem')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    await uploadResults(request, jobId!)

    const feedback = 'The outputs contain row-level data, so only this feedback is shared.'
    await withRole(browser, 'reviewer', async (page) => {
        await reviewerDecryptsAvailableOutputs(page, studyTitle, privateKey)
        await reviewerSharesOutputs(page, feedback, 'share-feedback-only')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        await expect(
            page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs need review'),
        ).toBeVisible()
        await viewStudyDetails(page, studyTitle)

        await expect(page.getByRole('heading', { level: 2, name: 'Verify outputs' })).toBeVisible()
        await expect(page.getByText(/Feedback on outputs available/)).toBeVisible()
        await expect(page.getByText(feedback)).toBeVisible()
        await expect(page.getByRole('textbox', { name: 'Security key' })).toHaveCount(0)
        await expect(page.getByTestId('outputs-files-section')).toHaveCount(0)
        await expect(page.getByTestId('cta-edit-code')).toBeVisible()

        // Reading the decision records RESULTS-VIEWED (OTTER-698) through a fire-on-mount action the
        // page never awaits (mark-outputs-decision-viewed.tsx), and a navigation in that instant cuts
        // the write off. The row itself is the signal, so stay until it exists.
        await expect(async () => {
            expect((await jobStatusRows(jobId!)).map((row) => row.status)).toContain('RESULTS-VIEWED')
        }).toPass()
        await expect(async () => {
            await visitAsRole(page, RESEARCHER_DASHBOARD)
            await expect(
                page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs reviewed'),
            ).toBeVisible()
        }).toPass()
    })
})
