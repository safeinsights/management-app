import {
    expect,
    test,
    visitAsRole,
    readTestSupportFile,
    fillLexicalField,
    insertLexicalLink,
    goto,
    withRole,
    type Page,
} from './e2e.helpers'
import {
    seedApprovedNoCode,
    seedCodeApprovedJobReady,
    seedCodeResultsReady,
    seedCodeRejected,
    seedCodeSubmitted,
    seedProposalPendingReview,
} from './e2e.seed'
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

// OTTER-463: rich-text links must carry target="_blank" through submission so
// neither researcher nor reviewer gets navigated off SafeInsights by a click.
const PROPOSAL_LINK_TEXT = 'Prior study writeup'
const PROPOSAL_LINK_URL = 'https://example.com/prior-study'

// ============================================================================
// Researcher: study creation (Step 1 + Step 2) — driven live by ONE test
// ============================================================================

// OTTER-690: Step 1 is one card, and the study title is entered here rather than on Step 2.
async function fillStep1(page: Page, studyTitle: string, orgNameRegex: RegExp = /openstax/i) {
    await expect(page.getByText(/^STEP 1$/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up study', level: 2 })).toBeVisible()

    await page.getByLabel(/Study title/).fill(studyTitle)

    const orgSelect = page.getByTestId('org-select')
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: orgNameRegex }).click()

    // Language radios appear after an org is chosen.
    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible' })
    await radioButton.click()
}

// Save & continue now opens a confirmation modal before navigating, because the Data Partner and
// language cannot be changed after this step.
async function confirmStep1(page: Page) {
    const proceedButton = page.getByRole('button', { name: 'Save & continue' })
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Continue to the next step?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Continue' }).click()
}

async function navigateToProposeStudy(page: Page, studyTitle: string) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)

    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible' })
    await newStudyButton.click()
    await page.waitForURL(/\/study\/request$/)

    await fillStep1(page, studyTitle)
    await confirmStep1(page)

    await page.waitForURL(/\/proposal$/)
    await expect(page.getByText('STEP 2')).toBeVisible()
}

// No title argument: it is supplied on Step 1 now (OTTER-690), and this page no longer renders a
// title field at all. Callers keep their own copy of the title for later dashboard row lookups.
async function fillAndSubmitProposal(page: Page, opts: { linkNotes?: boolean } = {}) {
    await expect(page.getByLabel('Study Title')).toHaveCount(0)

    await page.getByPlaceholder('Select dataset(s) of interest').click()
    await page.getByRole('option').first().click()

    await fillLexicalField(page, 'Research question(s)', 'What is the impact of highlighting on student outcomes?')
    await fillLexicalField(page, 'Project summary', 'We analyze archival data to study highlighting behavior.')
    await fillLexicalField(page, 'Impact', 'This research will improve understanding of study habits.')

    if (opts.linkNotes) {
        await insertLexicalLink(page, 'Additional notes or requests', PROPOSAL_LINK_TEXT, PROPOSAL_LINK_URL)
        // Confirm before submitting: an unmarked link here would navigate the
        // researcher out of the app on click.
        await expect(page.locator(`a[href="${PROPOSAL_LINK_URL}"]`)).toHaveAttribute('target', '_blank')
    }

    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    await page.getByRole('option').first().click()

    // OTTER-691: the button is never disabled on validity, and the modal's confirm carries the
    // same label as the button that opened it.
    const submitButton = page.getByRole('button', { name: 'Submit proposal' })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog.getByText('Submit your proposal?')).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Submit proposal' }).click()

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

// From an APPROVED-no-code study's dashboard, walk View -> /submitted -> /agreements/researcher
// -> /code so the upload surface is reached the way the app routes a real user.
async function navigateToCodeUpload(page: Page, studyTitle: string) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await clickViewLink(page, studyRow)

    await page.waitForURL(/\/submitted(\?.*)?$/)
    await page.getByRole('link', { name: /Proceed to step 3/i }).click()
    await page.waitForURL(/\/agreements\/researcher(\?.*)?$/)
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

    // main file must be picked explicitly when multiple files are present.
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await page.getByRole('button', { name: `Set ${mainFileName} as main file` }).click()
        await expect(page.getByRole('button', { name: `${mainFileName} is the main file` })).toBeVisible()
    }).toPass()

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

// Resubmit upload: two files, no star click. insertSubmittedJob seeds main.r as MAIN-CODE;
// asserting that star is already selected is what proves inheritance. Clicking it would
// set an override and hide a broken inheritance rule.
async function uploadResubmitFilesExpectingInheritedMain(page: Page) {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(['tests/fixtures/code-samples/main.r', 'tests/fixtures/code-samples/code.r'])

    await expect(page.getByRole('cell', { name: 'main.r', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'code.r', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'main.r is the main file' })).toBeVisible()
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

    // Approving kicks off the enclave run (JOB-READY under SIMULATE_CODE_BUILD), so the reviewer
    // lands on the outputs-pending "Review outputs" screen rather than the approval confirmation.
    await expect(page.getByTestId('status-alert')).toBeVisible()
    await expect(page.getByText(/Outputs not ready/)).toBeVisible()
    await page.getByRole('link', { name: /Back to my studies/i }).click()
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

// OTTER-668 + OTTER-676: the outputs-available screen, both phases. Like the errored screen,
// a validated key swaps the form for the outputs table and Decision section on the same URL —
// decryption is client-side, so the swap is a local phase flip, not a navigation.
async function reviewerDecryptsAvailableOutputs(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByText(/Outputs are available for review/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View' })
    await expect(viewButton).toBeEnabled()
    await viewButton.click()

    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
    await expect(page.getByText('Review the outputs before sharing')).toBeVisible()
}

// OTTER-667 + OTTER-675: the errored outputs screen, both phases. The key form gives way to
// the outputs table and Decision section without a navigation, because decryption is client-side, so
// the swap is a local phase flip on the same URL.
async function reviewerDecryptsErrorLogs(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Review Studies')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View' })
    await expect(viewButton).toBeEnabled()
    await viewButton.click()

    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
    await expect(page.getByText('Review the outputs before sharing')).toBeVisible()
}

// OTTER-675: submitting the decision from the decrypted view. Shares the outputs so the
// researcher-side assertions below have something to see.
async function reviewerSharesOutputs(page: Page, feedback: string): Promise<void> {
    await expect(page.getByTestId('outputs-decision-section')).toBeVisible()

    const editor = page.getByLabel('Decision feedback')
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.fill(feedback)

    await page.getByTestId('outputs-decision-share-outputs').check()

    const trigger = page.getByTestId('outputs-submit-decision')
    await trigger.click()

    // Scope to the dialog: the page's own trigger and the modal's confirm share the label
    // "Submit decision", so an unscoped role query matches both once the modal is open.
    const modal = page.getByRole('dialog', { name: 'Submit your decision?' })
    await expect(modal).toBeVisible()
    // The modal names what is about to be shared before anything is written.
    await expect(modal.getByText(/You are sharing the output files and your feedback with/)).toBeVisible()

    // Focus must come back to the trigger on every dismissal. The modal stays mounted while
    // closed so Mantine's own returnFocus can do it; unmounting it would take useFocusReturn
    // along with it. Checked here rather than in jsdom, where the Lexical editor this flow needs
    // is not typeable. Escape first, then the X, then reopen for the real submit.
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Close' }).click()
    await expect(modal).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Submit decision' }).click()

    // The decision re-resolves the reviewer screen; leaving the errored view is the signal.
    await expect(page.getByTestId('outputs-decision-section')).toBeHidden()
}

// OTTER-675: blank submit must flag both fields and open no modal.
async function reviewerSeesValidationOnBlankSubmit(page: Page): Promise<void> {
    const editor = page.getByLabel('Decision feedback')
    const trigger = page.getByTestId('outputs-submit-decision')

    // The caret starts inside the empty editor, which is where this used to break: raising the
    // "enter your feedback" message as the editor lost focus inserted a line above the navigation
    // row, so the button moved out from under the pointer between mousedown and mouseup, the click
    // was never delivered, and only the field the blur had flagged was ever reported.
    await editor.click()
    await trigger.click()

    await expect(page.getByText(/Enter your feedback for .* before submitting\./)).toBeVisible()
    await expect(page.getByText('Select an option before submitting')).toBeVisible()
    const options = page.locator('input[name="outputs-decision"]')
    await expect(options.first()).toHaveAttribute('aria-invalid', 'true')
    await expect(options.last()).toHaveAttribute('aria-invalid', 'true')
    await expect(editor).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Submit your decision?' })).toBeHidden()

    // Tab must move focus on rather than typing a tab character, and must keep going until it
    // reaches the radios (WCAG 2.1.2). Checked here rather than in jsdom, where Lexical's Tab
    // handler returns early for want of a range selection and the assertion cannot fail.
    const typed = 'Checking the keyboard path.'
    await editor.fill(typed)
    await page.keyboard.press('Tab')
    await expect(editor).not.toBeFocused()
    // textContent(), not toHaveText: the latter normalizes whitespace, so it would pass on the very
    // tab character this asserts is absent.
    await expect(async () => {
        const text = await editor.textContent()
        expect(text).toContain(typed)
        expect(text).not.toContain('\t')
    }).toPass()

    // Tabs until the radio is reached rather than assuming a count: the editor's formatting
    // toolbar sits between the two and its size is not this test's business.
    const firstOption = page.getByTestId('outputs-decision-share-outputs')
    const isFocused = () => firstOption.evaluate((el) => el === document.activeElement)
    for (let i = 0; i < 12 && !(await isFocused()); i++) {
        await page.keyboard.press('Tab')
    }
    await expect(firstOption).toBeFocused()
}

// The researcher's errored view is gated on a files decision existing (awaitingFilesDecisionOnError),
// so this runs only after reviewerSharesOutputs (OTTER-675).
// OTTER-696: sharing the outputs on an errored run records FILES-APPROVED alongside JOB-ERRORED,
// which now routes the researcher to the errored-outputs step instead of the old inline error
// panel — they decrypt with their own key to diagnose the failure, then edit and resubmit.
// Asserts the pre-decryption landing only: the decrypt phase needs researcher-wrapped keys that
// this seed does not provision, and is covered by shared-outputs-panel.test.tsx.
async function verifyErroredOutputsSharedDisplay(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, RESEARCHER_DASHBOARD)

    const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
    await expect(studyRow.getByText(/Errored/i)).toBeVisible()

    await viewStudyDetails(page, studyTitle)

    await expect(page.getByRole('heading', { level: 2, name: 'Verify outputs' })).toBeVisible()
    await expect(page.getByText(/Decrypt outputs to view code error/i)).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Security key' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Previous step/i })).toBeVisible()

    // Both post-decryption actions stay out of the DOM until a key has been validated.
    await expect(page.getByRole('link', { name: /Edit code/i })).toBeHidden()
    await expect(page.getByRole('link', { name: /Back to my studies/i })).toBeHidden()
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
        await navigateToProposeStudy(page, studyTitle)
        await fillAndSubmitProposal(page, { linkNotes: true })

        // The read-only render of a submitted proposal is a separate Lexical mount, so
        // assert the link survives there too and not just in the editor.
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
        await clickViewLink(page, studyRow)
        await page.waitForURL(/\/submitted(\?.*)?$/)

        // This view mounts the proposal collapsed (initialExpanded={false}), so the body is
        // display:none until the toggle is clicked.
        await page.getByTestId('proposal-toggle-header').click()
        const proposalBody = page.getByTestId('proposal-body')
        await expect(proposalBody).toBeVisible()

        const submittedLink = proposalBody.getByRole('link', { name: PROPOSAL_LINK_TEXT })
        await expect(submittedLink).toHaveAttribute('href', PROPOSAL_LINK_URL)
        await expect(submittedLink).toHaveAttribute('target', '_blank')
    })
})

// OTTER-572: a draft left on Step 2 must reopen on Step 2 from the dashboard,
// not the Step 1 data-org picker. Drives the real flow: create via Step 1,
// land on Step 2, fill a field (creating Step 2 progress), navigate back
// (which flushes fields to the study row via onUpdateDraftStudyAction), then
// verify the dashboard "Edit draft" link routes to /proposal.
//
// OTTER-690 canary: the title now arrives from Step 1, so the dataset selection is the only thing
// left creating Step 2 progress. draftHasStep2Progress keys on datasets, so it should still
// resolve, and this test is what proves it.
test('Researcher resumes a Step 2 draft on Step 2', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('resume-step2')

    await withRole(browser, 'researcher', async (page) => {
        await navigateToProposeStudy(page, studyTitle)

        const datasets = page.getByPlaceholder('Select dataset(s) of interest')
        await datasets.click()
        await page.getByRole('option').first().click()
        // Close the dropdown so it doesn't overlay the footer buttons.
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option')).toHaveCount(0)

        // Navigate back, which triggers save-on-navigate and flushes Step 2 fields
        // to the study row so draftHasStep2Progress resolves correctly.
        await page.getByRole('button', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit$/)

        // Revisiting Step 1 keeps the title editable and shows it as saved, while the Data
        // Partner and language are now settled and render as text.
        await expect(page.getByLabel(/Study title/)).toHaveValue(studyTitle)
        await expect(page.getByTestId('org-select')).toHaveCount(0)
        await expect(page.getByRole('radio', { name: 'R', exact: true })).toHaveCount(0)

        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const draftRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(draftRow).toBeVisible()
        await draftRow.getByRole('link', { name: /Edit draft study/i }).click()

        // Resumes on Step 2 (/proposal), NOT the Step 1 picker (/edit).
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByText('STEP 2')).toBeVisible()
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

// Owns the outputs-available surface end to end (OTTER-668 + OTTER-676): decrypt, the
// validation gate, and sharing the outputs through the confirmation modal. Seeds a
// JOB-READY job, uploads an encrypted result via the debug script (no runner), then
// drives the UI, then ends on the researcher's side: sharing records FILES-APPROVED, which is
// what surfaces the approved-results message on their study view.
test('Successful results review', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('results')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    uploadResults(jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerDecryptsAvailableOutputs(page, studyTitle)
        await reviewerSeesValidationOnBlankSubmit(page)
        await reviewerSharesOutputs(page, 'Reviewed the outputs — no sensitive or restricted data present.')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        await viewStudyDetails(page, studyTitle)
        await expect(page.getByText(/results of your study have been approved/i)).toBeVisible()
    })
})

// Owns the errored-outputs surface end to end (OTTER-667 + OTTER-675): decrypt, the
// validation gate, the confirmation modal, and the researcher's view of the shared logs.
test('Error log review', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('error-log')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    uploadErrorLogs(jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerDecryptsErrorLogs(page, studyTitle)
        await reviewerSeesValidationOnBlankSubmit(page)
        await reviewerSharesOutputs(page, 'The run failed on a timeout; the logs contain no PII.')
    })

    await withRole(browser, 'researcher', async (page) => {
        await verifyErroredOutputsSharedDisplay(page, studyTitle)
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

        // The form must load the previously-saved proposal values for editing, not
        // empty placeholders. These mirror the content seeded by seedProposalPendingReview.
        await expect(page.getByLabel('Study Title')).toHaveValue(studyTitle)
        await expect(page.getByLabel('Research question(s)')).toContainText(
            'What is the impact of highlighting on student outcomes?',
        )
        await expect(page.getByLabel('Project summary')).toContainText(
            'We analyze archival data to study highlighting behavior.',
        )
        await expect(page.getByLabel('Impact')).toContainText(
            'This research will improve understanding of study habits.',
        )

        // Form is pre-filled; only the resubmission note gates submit.
        await fillLexicalField(page, 'Resubmission Note', 'Clarified the dataset scope and analysis plan per feedback.')

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

        await uploadResubmitFilesExpectingInheritedMain(page)

        await page.getByLabel(/Resubmission Note/i).fill('Updated code per reviewer feedback.')

        const resubmitButton = page.getByRole('button', { name: /^Resubmit study code$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page.getByRole('button', { name: /^Yes, resubmit study code$/i }).click()

        await page.waitForURL('**/view')
    })
})

// Owns the researcher code-resubmit surface from a RESULTS-READY study (FILES-APPROVED). OTTER-558:
// the resubmit page rendered but saveCodeResubmissionNoteDraftAction / resubmitStudyCodeAction rejected
// this state because they gated on the topmost job status instead of the decision, throwing "Study is
// not editable" on every autosave keystroke. Guards the full page + autosave + resubmit wiring on the
// exact state QA reported. (The non-deterministic ordering that triggered it is covered by unit tests;
// the seed here is deterministically ordered.)
test('Results-ready code resubmission', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('results-resubmit')
    const { studyId } = await seedCodeResultsReady(studyTitle)

    await withRole(browser, 'researcher', async (page) => {
        await goto(page, `/openstax-lab/study/${studyId}/resubmit`)
        await expect(page.getByRole('heading', { name: /Edit study code/i })).toBeVisible()

        await uploadResubmitFilesExpectingInheritedMain(page)

        // Filling the note fires the debounced autosave against the real action: the "All changes
        // saved" indicator must appear and no "not editable" error toast. This guards the page +
        // autosave + resubmit wiring on a Results-ready study, NOT the ordering bug itself: this seed
        // is deterministically ordered (FILES-APPROVED newest), so the old at(0) gate would have
        // passed here too. The ordering-triggered failure is covered by the unit tests.
        await page.getByLabel(/Resubmission Note/i).fill('Reworked code after the results were approved.')
        await expect(page.getByText(/All changes saved/i)).toBeVisible()
        await expect(page.getByText(/Study is not editable or you do not have access/i)).toBeHidden()

        const resubmitButton = page.getByRole('button', { name: /^Resubmit study code$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page.getByRole('button', { name: /^Yes, resubmit study code$/i }).click()

        await page.waitForURL('**/view')
    })
})

// Owns the reviewer post-code-rejection surface (terminal) + the researcher terminal
// rejected-code view. OTTER-650 removed the DP "Reject and end study" option, so the
// CODE-REJECTED state can no longer be reached through the UI; we seed it directly to
// keep coverage of the preserved post-rejection views.
test('Code rejection ends the study', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-hard-rej')
    const { studyId } = await seedCodeRejected(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await goto(page, `/openstax/study/${studyId}/review`)

        await expect(page.getByText(/Rejected on/)).toBeVisible()
        await expect(page.getByTestId('decision-banner-code-rejected')).toBeVisible()
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

// ============================================================================
// Required-field blur validation (OTTER-647)
// ============================================================================

// Owns the blur-validation surface: leaving a required field incomplete must flag it
// rather than silently disabling submit. Drives Step 1 and Step 2 live because the
// behavior is the interaction itself and cannot be seeded.
//
// OTTER-690 reshaped Step 1: Save & continue is never disabled, because clicking it is what
// surfaces the errors, and the title is validated here rather than on Step 2.
test('Incomplete required fields are flagged when the researcher moves on', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('blur-validation')

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const newStudyButton = page.getByTestId('new-study').first()
        await newStudyButton.waitFor({ state: 'visible' })
        await newStudyButton.click()
        await page.waitForURL(/\/study\/request$/)

        // Nothing is flagged before the researcher interacts, and the button is live from load.
        const proceed = page.getByRole('button', { name: 'Save & continue' })
        await expect(proceed).toBeEnabled()
        await expect(page.getByText('Select a Data Partner before continuing.')).toBeHidden()
        await expect(page.getByText('Enter a study title before continuing.')).toBeHidden()

        // Focusing the title and leaving it empty raises its error on blur.
        const title = page.getByLabel(/Study title/)
        await title.click()
        await page.getByTestId('org-select').click()
        await expect(page.getByText('Enter a study title before continuing.')).toBeVisible()
        await page.keyboard.press('Escape')

        // Clicking with everything blank flags every visible field at once. Two, not three: the
        // programming-language field is not on the page until a Data Partner is chosen.
        await title.fill('')
        await proceed.click()
        await expect(page.getByText('Enter a study title before continuing.')).toBeVisible()
        await expect(page.getByText('Select a Data Partner before continuing.')).toBeVisible()
        await expect(page.getByText('Select a programming language before continuing.')).toBeHidden()
        await expect(title).toBeFocused()
        await expect(proceed).toBeEnabled()

        // Editing clears the error immediately, without waiting for a blur.
        await title.fill(studyTitle)
        await expect(page.getByText('Enter a study title before continuing.')).toBeHidden()

        // A whitespace-only title still counts as empty on the next click.
        await title.fill('   ')
        await proceed.click()
        await expect(page.getByText('Enter a study title before continuing.')).toBeVisible()

        // Past the character limit the error appears live, before any blur or click, and clears
        // again as soon as the value comes back under.
        await title.fill('x'.repeat(61))
        await expect(
            page.getByText('Study title exceeds the 60 character limit. Shorten it to continue.'),
        ).toBeVisible()
        await title.fill('x'.repeat(60))
        await expect(page.getByText('Study title exceeds the 60 character limit. Shorten it to continue.')).toBeHidden()

        // Resolving everything lets the same button through to the confirmation modal. Cancel
        // returns to the page with the entered values intact.
        await fillStep1(page, studyTitle)
        await proceed.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByText('Continue to the next step?')).toBeVisible()
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toBeHidden()
        await expect(title).toHaveValue(studyTitle)

        // ...and confirming moves on to Step 2.
        await confirmStep1(page)
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByText('STEP 2')).toBeVisible()

        // Step 2 no longer owns the title, and OTTER-691 removed its placeholders.
        await expect(page.getByLabel('Study Title')).toHaveCount(0)
        await expect(page.getByPlaceholder('Select dataset(s) of interest')).toHaveCount(0)

        // Its own required fields still flag on blur (OTTER-647), now with per-field wording.
        await page.locator('#datasets').click()
        await page.keyboard.press('Escape')
        await page.getByRole('textbox', { name: 'Principal Investigator' }).click()
        await expect(page.getByText('Select a dataset of interest before continuing.').first()).toBeVisible()
        await page.keyboard.press('Escape')

        // Submit is live from load, and clicking it with an empty form flags every required field
        // at once rather than disabling itself.
        const submit = page.getByRole('button', { name: 'Submit proposal' })
        await expect(submit).toBeEnabled()
        await submit.click()
        await expect(page.getByText('Select a dataset of interest before continuing.').first()).toBeVisible()
        await expect(page.getByText('Enter your research questions before continuing.')).toBeVisible()
        await expect(page.getByText('Enter your project summary before continuing.')).toBeVisible()
        await expect(page.getByText('Enter your proposal impact before continuing.')).toBeVisible()
        await expect(page.getByText('Select a Principal Investigator before continuing.')).toBeVisible()
        await expect(submit).toBeEnabled()
        await expect(page.getByRole('dialog')).toBeHidden()
    })
})
