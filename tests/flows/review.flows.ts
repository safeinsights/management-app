// Shared page flows (reviewer proposal and code decisions): plain functions that take a `page`. They are tier-agnostic by
// rule (eslint.config.mjs): no database, no server modules, no environment, so the hermetic suite and
// the deployed suite drive the same screens the same way. Moved verbatim out of tests/study-flow.spec.ts;
// every submit-shaped flow is still driven live by exactly ONE owning test per tier, and every other
// test reaches that state through seeding.

import { expect, type Page } from '@playwright/test'
import { visitAsRole } from './page'
import { typeIntoLexical } from './lexical'
import { REVIEWER_DASHBOARD, viewStudyDetails } from './dashboard.flows'

export async function reviewerApprovesProposal(page: Page, studyTitle: string) {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    // The badge states the reviewer's own situation, which is the whole point of the two tables
    // (OTTER-698): the same study reads "Proposal submitted" to the lab that sent it.
    await expect(page.getByRole('row').filter({ hasText: studyTitle }).getByText('Proposal needs review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)

    const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
    await expect(feedbackEditor).toBeVisible()
    await typeIntoLexical(feedbackEditor, 'Approving this initial request — feasibility and impact look reasonable.')

    await page
        .getByTestId('review-decision-section')
        .getByRole('radio', { name: /^Approve$/i })
        .check()

    const submitReview = page.getByRole('button', { name: /^Submit decision$/i })
    await expect(submitReview).toBeEnabled()
    await submitReview.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Approve proposal$/i }).click()
    await expect(dialog).toBeHidden()

    // A live-approved study has no agreement yet, so the preparing notice is a second status alert.
    await expect(page.getByTestId('status-alert').filter({ hasText: 'Proposal approved' })).toBeVisible()
    await page.getByTestId('cta-back-to-my-studies').click()
    await page.waitForURL('/dashboard')
}

export const CODE_CRITERIA_KEYS = ['proposalAlignment', 'agreementCompliance', 'privacyProtection']

// Reaches the code-review editor from the reviewer dashboard: View lands on /review, which resolves
// straight to the editor. OTTER-727 hid the agreements gate (STEP 2A) that used to render first when
// the reviewer hadn't acked, so there is no longer a conditional hop to handle here.
export async function openCodeReviewEditor(page: Page, studyTitle: string) {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    // Reached only with a decision outstanding, on a first submission or a resubmission alike.
    await expect(page.getByRole('row').filter({ hasText: studyTitle }).getByText('Code needs review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)

    await page.waitForURL(/\/review(\?.*)?$/)
    await expect(page.getByTestId('code-review-section')).toBeVisible()
}

export async function fillCodeCriteria(page: Page, value: 'yes' | 'no') {
    for (const key of CODE_CRITERIA_KEYS) {
        await page.locator(`input[name="criteria-${key}"][value="${value}"]`).check()
    }
}

export async function reviewerApprovesCode(page: Page, studyTitle: string) {
    await openCodeReviewEditor(page, studyTitle)

    await fillCodeCriteria(page, 'yes')
    await page.getByTestId('code-review-decision-approve').click()
    const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
    await expect(feedbackEditor).toBeVisible()
    await typeIntoLexical(feedbackEditor, 'Approving submitted code — looks good to run.')

    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Approve code?')).toBeVisible()
    await dialog.getByRole('button', { name: /^Approve code$/i }).click()
    await expect(dialog).toBeHidden()

    // The decision lands on the approved STEP 2 code page. Bare /review would resolve an approved
    // study straight past it to the outputs step.
    await page.waitForURL(/\/review\/code$/)
    await expect(page.getByTestId('status-alert')).toContainText('Code approved')

    // That outputs step is what lies ahead, still pending because approving kicks off the enclave
    // run (JOB-READY under SIMULATE_CODE_BUILD).
    await page.getByTestId('cta-next-step').click()
    await expect(page.getByTestId('status-alert')).toContainText('Outputs not ready')
    await page.getByRole('link', { name: /Back to my studies/i }).click()
    await page.waitForURL('/dashboard')
}

// From the open code review editor: "Request revision" -> CODE-CHANGES-REQUESTED (resubmittable),
// standard confirm modal.
export async function reviewerRequestsCodeRevision(page: Page, feedback: string) {
    await fillCodeCriteria(page, 'no')
    await page.getByTestId('code-review-decision-needs-clarification').click()
    const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
    await expect(feedbackEditor).toBeVisible()
    await typeIntoLexical(feedbackEditor, feedback)

    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Request revision?')).toBeVisible()
    await dialog.getByRole('button', { name: /^Request revision$/i }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByTestId('status-alert')).toContainText('Revision requested')
}
