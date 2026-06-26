import {
    expect,
    test,
    visitAsRole,
    readTestSupportFile,
    fillLexicalField,
    goto,
    withRole,
    type Page,
} from './e2e.helpers'
import { seedApprovedNoCode, seedCodeApprovedJobReady, seedCodeSubmitted, seedProposalPendingReview } from './e2e.seed'
import { execSync } from 'child_process'

// E2e study-lifecycle coverage. Governing rule: every distinct UI surface is
// exercised live by at least ONE test; every other test seeds that state (via
// tests/e2e.seed.ts) and drives only the surface it owns. Auth is per-role
// storageState (tests/global.setup.ts) — tests never sign in; they open a context
// per role with `withRole`, which restores the saved session.
//
// There is no external job runner on CI: result/error flows seed a JOB-READY job
// (which `/api/studies/ready` recognises from the DB alone) and upload an encrypted
// file via the debug script, then drive the real reviewer decrypt+approve UI.

const RESEARCHER_DASHBOARD = '/openstax-lab/dashboard'
const REVIEWER_DASHBOARD = '/openstax/dashboard'

// ============================================================================
// Researcher: study creation (Step 1 + Step 2) — driven live by ONE test
// ============================================================================

async function selectOrgAndLanguage(page: Page, orgNameRegex: RegExp = /openstax/i) {
    await expect(page.getByText(/^STEP 1A$/i)).toBeVisible()
    const orgSelect = page.getByTestId('org-select')
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: orgNameRegex }).click()

    // Language radios appear after an org is chosen.
    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible' })
    await radioButton.click()
}

async function navigateToProposeStudy(page: Page) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)

    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible' })
    await newStudyButton.click()
    await page.waitForURL(/\/study\/request$/)

    await selectOrgAndLanguage(page)

    const proceedButton = page.getByRole('button', { name: /Proceed to Step 2/i })
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    await page.waitForURL(/\/proposal$/)
    await expect(page.getByText('STEP 2')).toBeVisible()
}

async function fillAndSubmitProposal(page: Page, studyTitle: string) {
    await page.getByLabel('Study Title').fill(studyTitle)

    await page.getByPlaceholder('Select dataset(s) of interest').click()
    await page.getByRole('option').first().click()

    await fillLexicalField(page, 'Research question(s)', 'What is the impact of highlighting on student outcomes?')
    await fillLexicalField(page, 'Project summary', 'We analyze archival data to study highlighting behavior.')
    await fillLexicalField(page, 'Impact', 'This research will improve understanding of study habits.')

    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    await page.getByRole('option').first().click()

    const submitButton = page.getByRole('button', { name: /Submit initial request/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await page.getByRole('button', { name: /Yes, submit initial request/i }).click()

    await expect(page.getByText(/successfully submitted/i)).toBeVisible()

    // Button component={Link} renders as an anchor.
    await page
        .getByRole('link', { name: /Go to dashboard/i })
        .first()
        .click()
    await page.waitForURL('**/dashboard')
}

// ============================================================================
// Researcher: code upload — file path and IDE path each driven live once
// ============================================================================

// From an APPROVED-no-code study's dashboard, walk View -> /submitted -> /agreements
// -> /code so the upload surface is reached the way the app routes a real user.
async function navigateToCodeUpload(page: Page, studyTitle: string) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await clickViewLink(page, studyRow)

    await page.waitForURL(/\/submitted(\?.*)?$/)
    await page.getByRole('link', { name: /Proceed to step 3/i }).click()
    await page.waitForURL(/\/agreements(\?.*)?$/)
    await page.getByRole('button', { name: /Proceed to Step 4/i }).click()
    await page.waitForURL(/\/code$/)
}

async function uploadCodeViaFileUpload(page: Page, mainCodeFile: string) {
    // The empty view shows a starter-code download link when the org configures a code
    // env with starter files (the openstax seed does). Shared CODER_FILES state in CI can
    // land us in the review view (no link), so only assert it when the empty card is shown.
    const uploadCardHeading = page.getByText('Upload your files')
    if (await uploadCardHeading.isVisible()) {
        const starterLink = page.getByRole('link', { name: /Starter code/i })
        await expect(starterLink).toBeVisible()
        await expect(starterLink).toHaveAttribute('href', /./)
        await expect(starterLink).toHaveAttribute('target', '_blank')
    }

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([mainCodeFile, 'tests/fixtures/code-samples/code.r'])

    const mainFileName = mainCodeFile.split('/').pop()!
    await expect(page.getByRole('cell', { name: mainFileName, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'code.r', exact: true })).toBeVisible()

    const submitButton = page.getByRole('button', { name: /Submit code/i })
    await expect(submitButton).toBeEnabled()
    // The fixed AppShell footer intercepts pointer events on Submit; scroll it clear.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await submitButton.click()

    const confirmButton = page.getByRole('button', { name: 'Yes, submit study code' })
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Code submission redirects to CodePostSubmissionView; wait on its banner (it
    // only appears after the mutation completes), not a URL change.
    await expect(page.getByTestId('code-under-review-banner')).toBeVisible()

    return mainFileName
}

// ============================================================================
// Shared row / navigation helpers
// ============================================================================

async function clickViewLink(page: Page, studyRow: ReturnType<Page['getByRole']>) {
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await studyRow.getByRole('link', { name: 'View' }).first().click()
    }).toPass()
}

async function viewStudyDetails(page: Page, studyTitle: string) {
    // Exclude only the top-level "Proposal draft" pill (case-sensitive) — `hasNotText`
    // is case-insensitive and would also drop intermediate states like "Code draft".
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await clickViewLink(page, studyRow)
    await page.waitForURL(/\/study\//)
}

// ============================================================================
// Reviewer: decision surfaces (each driven live by the test that owns it)
// ============================================================================

async function reviewerApprovesProposal(page: Page, studyTitle: string) {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)

    const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
    await expect(feedbackEditor).toBeVisible()
    await feedbackEditor.click()
    await page.keyboard.type('Approving this initial request — feasibility and impact look reasonable.')

    await page
        .getByTestId('review-decision-section')
        .getByRole('radio', { name: /^Approve$/i })
        .check()

    const submitReview = page.getByRole('button', { name: /^Submit review$/i })
    await expect(submitReview).toBeEnabled()
    await submitReview.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText(/Approved on/)).toBeVisible()
    await page.getByTestId('go-to-dashboard').click()
    await page.waitForURL('**/dashboard')
}

const CODE_CRITERIA_KEYS = ['proposalAlignment', 'agreementCompliance', 'securityChecks', 'privacyProtection']

// Reaches the code-review editor from the reviewer dashboard: View lands on /review.
// When the reviewer hasn't acked the agreements the gate (STEP 2A) renders first and
// "Proceed to Step 3" re-resolves bare /review to the editor; when agreements are
// already acked (the common seeded case) the editor renders directly. Handle both.
async function openCodeReviewEditor(page: Page, studyTitle: string) {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)

    await page.waitForURL(/\/review(\?.*)?$/)
    const proceed = page.getByRole('button', { name: /Proceed to Step 3/i })
    if (await proceed.isVisible().catch(() => false)) {
        await proceed.click()
    }
    await expect(page.getByTestId('code-review-section')).toBeVisible()
}

async function fillCodeCriteria(page: Page, value: 'yes' | 'no') {
    for (const key of CODE_CRITERIA_KEYS) {
        await page.locator(`input[name="criteria-${key}"][value="${value}"]`).check()
    }
}

async function reviewerApprovesCode(page: Page, studyTitle: string) {
    await openCodeReviewEditor(page, studyTitle)

    await fillCodeCriteria(page, 'yes')
    await page.getByTestId('code-review-decision-approve').click()
    const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
    await expect(feedbackEditor).toBeVisible()
    await feedbackEditor.click()
    await page.keyboard.type('Approving submitted code — looks good to run.')

    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText(/Approved on/)).toBeVisible()
    await page.getByTestId('go-to-dashboard').click()
    await page.waitForURL('**/dashboard')
}

// ============================================================================
// Job result / error helpers (no runner: upload via the debug script)
// ============================================================================

// The debug script defaults its base URL to :4000 (dev); point it at the Playwright app
// instance instead (E2E_BASE_URL, default :4100).
const DEBUG_UPLOAD_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4100'

function uploadErrorLogs(jobId: string): void {
    // Debug script encrypts the log with the test key, POSTs it, and sets JOB-ERRORED.
    execSync(
        `pnpm exec tsx bin/debug/upload-results.ts -j ${jobId} -l tests/assets/error-log.txt -u ${DEBUG_UPLOAD_URL}`,
        {
            stdio: 'inherit',
        },
    )
}

function uploadResults(jobId: string): void {
    // Same script, but uploads an encrypted result (RUN-COMPLETE) — the success counterpart.
    execSync(
        `pnpm exec tsx bin/debug/upload-results.ts -j ${jobId} -r tests/assets/results-with-pii.csv -u ${DEBUG_UPLOAD_URL}`,
        { stdio: 'inherit' },
    )
}

// Reviewer results-review (StudyDetailsReviewer) for a successful run: decrypt then
// approve. Result files auto-select on decrypt, so the job-level Approve enables
// without ticking a checkbox.
async function reviewerApprovesResults(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByPlaceholder('Enter your Reviewer key to access encrypted content.')
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const decryptButton = page.getByRole('button', { name: /Decrypt Files/i })
    await expect(decryptButton).toBeEnabled()
    await decryptButton.click()

    await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible()

    const approveButton = page.getByRole('button', { name: /^Approve$/i }).last()
    await expect(approveButton).toBeEnabled()
    await approveButton.click()
    await page.waitForURL('**/dashboard')
}

async function reviewerApprovesErrorLogs(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByPlaceholder('Enter your Reviewer key to access encrypted content.')
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const decryptButton = page.getByRole('button', { name: /Decrypt Files/i })
    await expect(decryptButton).toBeEnabled()
    await decryptButton.click()

    await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible()

    const checkbox = page.getByRole('checkbox', { name: /Select Code Run Log/i })
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    const approveButton = page.getByRole('button', { name: /approve/i }).last()
    await expect(approveButton).toBeEnabled()
    await approveButton.click()
    await page.waitForURL('**/dashboard')

    // Full reload clears the Router Cache so the details re-fetch from the DB.
    await goto(page, REVIEWER_DASHBOARD)
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)
    await expect(page.getByText(/Approved on/).last()).toBeVisible()
}

async function verifyFailedStatusDisplay(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, RESEARCHER_DASHBOARD)

    const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
    await expect(studyRow.getByText(/Errored/i)).toBeVisible()

    await viewStudyDetails(page, studyTitle)

    await expect(page.getByText(/The code errored/i)).toBeVisible()
    await expect(page.getByText(/Job ID/i)).toBeVisible()
    await expect(page.getByText(/Code Run Log:/i)).toBeVisible()
}

// ============================================================================
// Tests
// ============================================================================

// The study-creation → approve → upload chain was one long test; it's split into three
// independent tests (each seeds the state the previous one produced) so no single test
// runs long enough to risk its timeout, and a failure points at one surface. Together
// they still own Step 1, Step 2, proposal-approval, and the file-upload surfaces.

// Owns Step 1 + Step 2: the researcher creates and submits a proposal live.
test('Researcher submits a proposal', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('propose')

    await withRole(browser, 'researcher', async (page) => {
        await navigateToProposeStudy(page)
        await fillAndSubmitProposal(page, studyTitle)
    })
})

// Owns the reviewer proposal-approval surface. Seeds a PENDING-REVIEW proposal.
test('Reviewer approves a proposal', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('prop-approve')
    await seedProposalPendingReview(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerApprovesProposal(page, studyTitle)
    })
})

// Owns the researcher file-upload surface. Seeds an APPROVED-no-code study.
test('Researcher uploads code via file upload', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('file-upload')
    await seedApprovedNoCode(studyTitle)

    await withRole(browser, 'researcher', async (page) => {
        await navigateToCodeUpload(page, studyTitle)
        await uploadCodeViaFileUpload(page, 'tests/fixtures/code-samples/main.r')

        // Confirm the post-submission view renders for the researcher.
        await goto(page, RESEARCHER_DASHBOARD)
        await viewStudyDetails(page, studyTitle)
        await expect(page.getByRole('heading', { name: /^Study code/ })).toBeVisible()
        await expect(page.getByTestId('code-under-review-banner')).toBeVisible()
    })
})

// NOTE: "Code upload via IDE" was removed — the IDE flow provisions a Coder workspace
// via an external service that the e2e stack does not run. Coder is out of scope here.

// Owns the reviewer approve-code surface. Seeds CODE-SUBMITTED.
test('Reviewer approves submitted code', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-approve')
    await seedCodeSubmitted(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerApprovesCode(page, studyTitle)
    })
})

// Owns the reviewer results decrypt+approve surface. Seeds a JOB-READY job, uploads
// an encrypted result via the debug script (no runner), then drives the UI.
test('Successful results review', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('results')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    uploadResults(jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerApprovesResults(page, studyTitle)
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        await viewStudyDetails(page, studyTitle)
        await expect(page.getByText(/results of your study have been approved/i)).toBeVisible()
    })
})

// Owns the reviewer error-log decrypt+approve surface and the researcher
// errored-status view. Seeds a JOB-READY job, uploads an encrypted error log.
test('Error log review', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('error-log')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    uploadErrorLogs(jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerApprovesErrorLogs(page, studyTitle)
    })

    await withRole(browser, 'researcher', async (page) => {
        await verifyFailedStatusDisplay(page, studyTitle)
    })
})

// Owns the reviewer reject-proposal surface + the researcher rejected-proposal view.
test('Proposal rejection', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('prop-rej')
    await seedProposalPendingReview(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await visitAsRole(page, REVIEWER_DASHBOARD)
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await clickViewLink(page, studyRow)

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible()
        await expect(page.getByText(studyTitle)).toBeVisible()

        const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
        await expect(feedbackEditor).toBeVisible()
        await feedbackEditor.click()
        await page.keyboard.type('Rejecting this initial request — scope is not aligned with available data.')

        await page
            .getByTestId('review-decision-section')
            .getByRole('radio', { name: /^Reject$/i })
            .check()

        await page.getByRole('button', { name: /^Submit review$/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Reject initial request$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByText(/Rejected on/)).toBeVisible()
        await page.getByTestId('go-to-dashboard').click()
        await page.waitForURL('**/dashboard')

        const rejectedRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(rejectedRow).toBeVisible()
        await expect(rejectedRow.getByText(/REJECTED/i)).toBeVisible()
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await expect(studyRow.getByText(/REJECTED/i)).toBeVisible()

        await studyRow.getByRole('link', { name: 'View' }).first().click()
        // POST_SUBMISSION_STATUSES without job activity route to /submitted.
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByRole('heading', { name: 'Study proposal' })).toBeVisible()
        await expect(page.getByText(studyTitle).first()).toBeVisible()
        await expect(page.getByText(/Rejected on/)).toBeVisible()

        // Rejected proposals get a single "Go to dashboard" CTA — no Step-3 progression.
        await expect(page.getByRole('button', { name: /Proceed to Step 3/i })).not.toBeVisible()
        await expect(page.getByRole('link', { name: /Go to dashboard/i })).toBeVisible()
    })
})

// Owns the reviewer request-clarification surface AND the researcher proposal
// resubmit surface. Seeds PENDING-REVIEW, then drives clarify -> resubmit live.
test('Proposal clarification and resubmission', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('prop-clarify')
    await seedProposalPendingReview(studyTitle)
    let studyId = ''

    await withRole(browser, 'reviewer', async (page) => {
        await visitAsRole(page, REVIEWER_DASHBOARD)
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await clickViewLink(page, studyRow)

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible()

        const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
        await expect(feedbackEditor).toBeVisible()
        await feedbackEditor.click()
        await page.keyboard.type('Please clarify the dataset scope and the analysis plan before we can approve.')

        await page
            .getByTestId('review-decision-section')
            .getByRole('radio', { name: /Needs clarification/i })
            .check()

        await page.getByRole('button', { name: /^Submit review$/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByText(/Clarification requested on/)).toBeVisible()
        await expect(page.getByTestId('decision-banner-clarification')).toBeVisible()
        await page.getByTestId('go-to-dashboard').click()
        await page.waitForURL('**/dashboard')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link', { name: 'View' }).first().click()

        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByTestId('status-banner-CHANGE-REQUESTED')).toBeVisible()
        await expect(page.getByText(/Clarification requested on/)).toBeVisible()
        studyId = page.url().match(/\/study\/([^/]+)/)![1]

        await page.getByRole('link', { name: /Edit and resubmit/i }).click()
        await page.waitForURL(/\/edit-and-resubmit$/)

        await expect(page.getByRole('heading', { name: /Edit Initial Request/i, level: 1 })).toBeVisible()
        // Form is pre-filled; only the resubmission note gates submit.
        await page.getByLabel(/Resubmission Note/i).fill('Clarified the dataset scope and analysis plan per feedback.')

        const resubmitButton = page.getByRole('button', { name: /^Resubmit initial request$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page.getByRole('button', { name: /^Yes, resubmit initial request$/i }).click()

        await page.waitForURL(/\/submitted(\?.*)?$/)
    })

    await withRole(browser, 'reviewer', async (page) => {
        // Resubmission returns the proposal to PENDING-REVIEW: the editable
        // ProposalReviewView re-opens with a fresh decision section.
        await goto(page, `/openstax/study/${studyId}/review`)
        await expect(page.getByRole('heading', { name: /Review initial request/i, level: 1 })).toBeVisible()
        await expect(page.getByRole('button', { name: /^Submit review$/i })).toBeVisible()
    })
})

// Owns the reviewer request-code-changes surface AND the researcher code resubmit
// surface. Seeds CODE-SUBMITTED, drives request-changes; then seeds the resulting
// CODE-CHANGES-REQUESTED state implicitly via the live decision and drives resubmit.
test('Code change request and resubmission', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-change')
    await seedCodeSubmitted(studyTitle)
    let studyId = ''

    await withRole(browser, 'reviewer', async (page) => {
        await openCodeReviewEditor(page, studyTitle)

        await fillCodeCriteria(page, 'no')
        // "Request revision" -> CODE-CHANGES-REQUESTED (resubmittable), standard confirm modal.
        await page.getByTestId('code-review-decision-needs-clarification').click()
        const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
        await expect(feedbackEditor).toBeVisible()
        await feedbackEditor.click()
        await page.keyboard.type('Requesting revisions to submitted code — please address criteria.')

        await page.getByTestId('code-review-submit').click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByText(/Change requested on/)).toBeVisible()
        await page.getByTestId('go-to-dashboard').click()
        await page.waitForURL('**/dashboard')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link', { name: 'View' }).first().click()

        await expect(page.getByTestId('decision-banner-code-change-requested')).toBeVisible()
        await expect(page.getByTestId('cta-edit-and-resubmit')).toBeVisible()
        studyId = page.url().match(/\/study\/([^/]+)/)![1]

        await goto(page, `/openstax-lab/study/${studyId}/resubmit`)
        await expect(page.getByRole('heading', { name: /Edit study code/i })).toBeVisible()

        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(['tests/fixtures/code-samples/main.r', 'tests/fixtures/code-samples/code.r'])

        await page.getByLabel(/Resubmission Note/i).fill('Updated code per reviewer feedback.')

        const resubmitButton = page.getByRole('button', { name: /^Resubmit study code$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page.getByRole('button', { name: /^Yes, resubmit study code$/i }).click()

        await page.waitForURL('**/view')
    })
})

// Owns the reviewer hard-reject-code surface (terminal) + the researcher terminal
// rejected-code view. Seeds CODE-SUBMITTED.
test('Code rejection ends the study', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-hard-rej')
    await seedCodeSubmitted(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await openCodeReviewEditor(page, studyTitle)

        await fillCodeCriteria(page, 'no')
        // Reject -> CODE-REJECTED (study ends). Destructive confirm modal ("Reject study code?").
        await page.getByTestId('code-review-decision-reject').click()
        const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
        await expect(feedbackEditor).toBeVisible()
        await feedbackEditor.click()
        await page.keyboard.type('Rejecting submitted code — it cannot run against this dataset.')

        await page.getByTestId('code-review-submit').click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Reject study code$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByText(/Rejected on/)).toBeVisible()
        await expect(page.getByTestId('decision-banner-code-rejected')).toBeVisible()
        await page.getByTestId('go-to-dashboard').click()
        await page.waitForURL('**/dashboard')

        const rejectedRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(rejectedRow).toBeVisible()
        await expect(rejectedRow.getByText(/REJECTED/i)).toBeVisible()
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link', { name: 'View' }).first().click()

        // CODE-REJECTED is terminal: rejected banner + "Go to dashboard" only (no resubmit CTA).
        await expect(page.getByTestId('decision-banner-code-rejected')).toBeVisible()
        await expect(page.getByTestId('cta-go-to-dashboard')).toBeVisible()
        await expect(page.getByTestId('cta-edit-and-resubmit')).not.toBeVisible()
    })
})

// Owns the read-only ProposalReviewView surface. Seeds PENDING-REVIEW.
test('ProposalReviewView for study without code', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('proposal-only')
    const { studyId } = await seedProposalPendingReview(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        // This test asserts the review view's content, not the dashboard row — navigate
        // straight to the study (the seed gives us its id) instead of dashboard → View.
        await visitAsRole(page, `/openstax/study/${studyId}/review`)

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible()
        // "Review initial request" is both the h1 and a section h4 — pin to h1.
        await expect(page.getByRole('heading', { name: /Review initial request/i, level: 1 })).toBeVisible()

        await expect(page.getByText('Research question(s)', { exact: true })).toBeVisible()
        await expect(page.getByText('Project summary', { exact: true })).toBeVisible()
        await expect(page.getByText('Impact', { exact: true })).toBeVisible()
        await expect(page.getByText('Principal Investigator', { exact: true })).toBeVisible()

        await expect(page.getByRole('button', { name: /^Submit review$/i })).toBeVisible()
        const decisionSection = page.getByTestId('review-decision-section')
        await expect(decisionSection.getByRole('radio', { name: /^Approve$/i })).toBeVisible()
        await expect(decisionSection.getByRole('radio', { name: /^Reject$/i })).toBeVisible()
    })
})
