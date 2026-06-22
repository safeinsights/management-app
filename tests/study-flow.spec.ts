import { expect, test, visitClerkProtectedPage, readTestSupportFile, fillLexicalField, goto } from './e2e.helpers'
import type { Page } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { execSync } from 'child_process'

// must use object, see https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 90_000)
})

// ============================================================================
// Step 1: Org + language selection
// ============================================================================

async function selectOrgAndLanguage(page: Page, orgNameRegex: RegExp = /openstax/i) {
    await expect(page.getByText(/^STEP 1A$/i)).toBeVisible()
    const orgSelect = page.getByTestId('org-select')
    await orgSelect.waitFor({ state: 'visible' })

    await page.waitForTimeout(1000)
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: orgNameRegex }).click()

    // Wait for language radio buttons to appear after org selection
    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible' })
    await radioButton.click()
}

async function navigateToProposeStudy(page: Page, studyTitle: string): Promise<string> {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible' })
    await newStudyButton.click()
    await page.waitForURL(/\/study\/request$/)

    await selectOrgAndLanguage(page)

    const proceedButton = page.getByRole('button', { name: /Proceed to Step 2/i })
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    // Wait for navigation to proposal page (URL will contain /proposal)
    await page.waitForURL(/\/proposal$/)

    // On the Step 2 proposal form, fill required fields
    await expect(page.getByText('STEP 2')).toBeVisible()

    return studyTitle
}

// ============================================================================
// Step 2: Proposal form
// ============================================================================

async function fillAndSubmitProposal(page: Page, studyTitle: string) {
    // Fill the study title
    await page.getByLabel('Study Title').fill(studyTitle)

    // Select a dataset
    await page.getByPlaceholder('Select dataset(s) of interest').click()
    await page.getByRole('option').first().click()

    // Fill required lexical text fields
    await fillLexicalField(page, 'Research question(s)', 'What is the impact of highlighting on student outcomes?')
    await fillLexicalField(page, 'Project summary', 'We analyze archival data to study highlighting behavior.')
    await fillLexicalField(page, 'Impact', 'This research will improve understanding of study habits.')

    // Select PI from dropdown
    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    // Select the first available PI option
    await page.getByRole('option').first().click()

    // Submit the proposal
    const submitButton = page.getByRole('button', { name: /Submit initial request/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Confirm submission in modal
    await page.getByRole('button', { name: /Yes, submit initial request/i }).click()

    // Wait for the submitted confirmation page
    await expect(page.getByText(/successfully submitted/i)).toBeVisible()

    // Go to dashboard — Button component={Link} renders as an anchor in the DOM
    await page
        .getByRole('link', { name: /Go to dashboard/i })
        .first()
        .click()
    await page.waitForURL('**/dashboard')
}

// ============================================================================
// Step 3: Code upload helpers
// ============================================================================

async function uploadCodeViaFileUpload(page: Page, mainCodeFile: string) {
    // The empty view should show a working starter-code download link when a code env
    // with starter files is configured for the study's org (the openstax seed does).
    // Shared CODER_FILES state in CI can land us in the review view (which has no link),
    // so only assert the link when the empty-view card is visible.
    const uploadCardHeading = page.getByText('Upload your files')
    if (await uploadCardHeading.isVisible()) {
        const starterLink = page.getByRole('link', { name: /Starter code/i })
        await expect(starterLink).toBeVisible()
        await expect(starterLink).toHaveAttribute('href', /./)
        await expect(starterLink).toHaveAttribute('target', '_blank')
    }

    // Upload files via the file input in the FileDropOverlay
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([mainCodeFile, 'tests/fixtures/code-samples/code.r'])

    const mainFileName = mainCodeFile.split('/').pop()!
    await expect(page.getByRole('cell', { name: mainFileName, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'code.r', exact: true })).toBeVisible()

    // Wait for submit to be enabled (files newer than baseline job)
    const submitButton = page.getByRole('button', { name: /Submit code/i })
    await expect(submitButton).toBeEnabled()
    // The AppShell footer is fixed at the bottom of the viewport and intercepts pointer events
    // on Submit code. Scroll the page to the bottom so the button is not under the footer overlay.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await submitButton.click()

    // Confirmation modal gates the submission
    const confirmButton = page.getByRole('button', { name: 'Yes, submit study code' })
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Code submission redirects to the post-submission code view (CodePostSubmissionView).
    // Wait on a banner unique to that view rather than the URL — the post-submission
    // banner only appears after the mutation completes and the page re-renders.
    await expect(page.getByTestId('code-under-review-banner')).toBeVisible()

    return mainFileName
}

async function uploadCodeViaIDE(page: Page) {
    // The IDE button label depends on whether the workspace already has files:
    // "Launch IDE" in the empty view, "Edit files in IDE" in the review view.
    // Shared CODER_FILES dir in CI means a prior test's files can land us in the review view.
    const launchButton = page.getByRole('button', { name: /(Launch IDE|Edit files in IDE)/i })

    await Promise.all([page.waitForEvent('popup', { timeout: 5000 }).catch(() => null), launchButton.click()])

    // Wait for the IDE launch to complete (loading button disappears) before
    // checking the file table — the IDE warm-up can take longer than the default expect timeout.
    await expect(page.getByText(/Launching IDE/i)).toBeHidden()

    // Starter file appears in the file table after IDE launch
    await expect(page.getByRole('cell', { name: 'main.r', exact: true })).toBeVisible()

    // Upload an additional file to ensure submit is enabled
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(['tests/fixtures/code-samples/code.r'])
    await expect(page.getByText(/code.r/i)).toBeVisible()

    const submitButton = page.getByRole('button', { name: /Submit code/i })
    await expect(submitButton).toBeEnabled()
    // Footer overlap workaround — see uploadCodeViaFileUpload
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await submitButton.click()

    // Confirmation modal gates the submission
    const confirmButton = page.getByRole('button', { name: 'Yes, submit study code' })
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Code submission redirects to the post-submission view; wait on the banner.
    await expect(page.getByTestId('code-under-review-banner')).toBeVisible()

    return 'main.r'
}

// ============================================================================
// Reviewer helpers
// ============================================================================

async function clickViewLink(page: Page, studyRow: ReturnType<Page['getByRole']>) {
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt
    await expect(async () => {
        await studyRow.getByRole('link', { name: 'View' }).first().click()
    }).toPass()
}

async function viewStudyDetails(page: Page, studyTitle: string) {
    // Match the title row; older code excluded rows containing 'DRAFT', but `hasNotText`
    // is case-insensitive, so it also excluded intermediate states like "Code draft".
    // Use a case-sensitive regex to only exclude the top-level "Draft" pill.
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await clickViewLink(page, studyRow)
    await page.waitForURL(/\/study\//)
}

async function reviewerApprovesProposal(page: Page, studyTitle: string) {
    await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

    await expect(page.getByText('Review Studies')).toBeVisible()

    await viewStudyDetails(page, studyTitle)

    // ProposalReviewView: enter feedback in the review-feedback editor
    const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
    await expect(feedbackEditor).toBeVisible()
    await feedbackEditor.click()
    await page.keyboard.type('Approving this initial request — feasibility and impact look reasonable.')

    // Select the Approve decision
    await page
        .getByTestId('review-decision-section')
        .getByRole('radio', { name: /^Approve$/i })
        .check()

    // Submit + confirm
    const submitReview = page.getByRole('button', { name: /^Submit review$/i })
    await expect(submitReview).toBeEnabled()
    await submitReview.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()

    // Wait for the dialog to close (mutation in flight). Use a longer poll since the
    // review-submission server action does a fair amount of work + revalidations.
    await expect(dialog).toBeHidden()

    // After the mutation completes, the view re-renders in the post-submission state
    // with a "Go to dashboard" button (PostFeedbackView).
    await expect(page.getByText(/Approved on/)).toBeVisible()
    await page.getByTestId('go-to-dashboard').click()
    await page.waitForURL('**/dashboard')
}

// Mirrors the redesigned code-review flow (CodeReview / CodeReviewClient): the
// reviewer answers all four criteria, picks the Approve decision, leaves a
// feedback comment, then confirms in the modal. The page used to expose a
// single inline "Approve" button; that flow is gone with the feature-flag
// removal.
async function reviewerApprovesCode(page: Page, studyTitle: string) {
    await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

    await expect(page.getByText('Review Studies')).toBeVisible()

    await viewStudyDetails(page, studyTitle)

    // With code submitted, the reviewer is redirected to the agreements page
    await page.waitForURL(/\/agreements(\?.*)?$/)
    await expect(page.getByText('STEP 2A')).toBeVisible()
    await expect(page.getByText('STEP 2B')).toBeVisible()
    await expect(page.getByText('STEP 2C')).toBeVisible()

    // Proceed to code review
    await page.getByRole('button', { name: /Proceed to Step 3/i }).click()
    await page.waitForURL(/\/review\?from=agreements-proceed$/)

    // Answer all four review criteria with "yes" so the submit button enables.
    const criteriaKeys = ['proposalAlignment', 'agreementCompliance', 'securityChecks', 'privacyProtection']
    for (const key of criteriaKeys) {
        await page.locator(`input[name="criteria-${key}"][value="yes"]`).check()
    }

    // Pick the Approve decision and leave the required feedback comment.
    await page.getByTestId('code-review-decision-approve').click()
    const feedbackEditor = page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()
    await expect(feedbackEditor).toBeVisible()
    await feedbackEditor.click()
    await page.keyboard.type('Approving submitted code — looks good to run.')

    // Submit and confirm.
    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Yes, submit review$/i }).click()
    await expect(dialog).toBeHidden()

    // The redesign keeps the reviewer on the post-feedback view; take the
    // "Go to dashboard" CTA the same way reviewerApprovesProposal does.
    await expect(page.getByText(/Approved on/)).toBeVisible()
    await page.getByTestId('go-to-dashboard').click()
    await page.waitForURL('**/dashboard')
}

async function researcherNavigatesToCodeUpload(page: Page, studyTitle: string) {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    // After approval, "View" lands on the /submitted page (APPROVED + no job activity).
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await clickViewLink(page, studyRow)
    await page.waitForURL(/\/submitted(\?.*)?$/)

    // Click "Proceed to step 3" to enter the agreements flow.
    await page.getByRole('link', { name: /Proceed to step 3/i }).click()
    await page.waitForURL(/\/agreements(\?.*)?$/)

    await expect(page.getByText('STEP 3A')).toBeVisible()
    await expect(page.getByText('STEP 3B')).toBeVisible()
    await expect(page.getByText('STEP 3C')).toBeVisible()

    // Test Previous → ResearcherProposalView → Proceed to Step 3 round-trip
    const previousButton = page.getByRole('button', { name: /^Previous$/i })
    await previousButton.scrollIntoViewIfNeeded()
    await expect(previousButton).toBeVisible()
    await previousButton.click()

    // Should land on /view?from=agreements and show ResearcherProposalView
    await page.waitForURL(/\/view\?from=agreements(&|$)/)
    await expect(page.getByText('STEP 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Study proposal' })).toBeVisible()
    await expect(page.getByText(studyTitle)).toBeVisible()
    await expect(page.getByText(/Approved on/)).toBeVisible()

    // Should show "Proceed to Step 3" since we came from agreements
    const proceedToStep3 = page.getByRole('button', { name: /Proceed to Step 3/i })
    await expect(proceedToStep3).toBeVisible()
    await proceedToStep3.click()

    // Should navigate back to agreements
    await page.waitForURL(/\/agreements(\?.*)?$/)
    await expect(page.getByText('STEP 3A')).toBeVisible()

    // Click through agreements to code upload
    const proceedButton = page.getByRole('button', { name: /Proceed to Step 4/i })
    await expect(proceedButton).toBeVisible()
    await proceedButton.click()

    // Wait for code upload page
    await page.waitForURL(/\/code$/)
    await expect(page.getByText('STEP 4 of 4')).toBeVisible()

    // Verify Previous on code upload navigates back to agreements
    await page.getByRole('link', { name: /Previous/i }).click()
    await page.waitForURL(/\/agreements(\?.*)?$/)

    // Navigate back to code upload — no job exists yet so button is still "Proceed to Step 4"
    const proceedAgain = page.getByRole('button', { name: /Proceed to Step 4/i })
    await expect(proceedAgain).toBeVisible()
    await proceedAgain.click()
    await page.waitForURL(/\/code$/)
}

// ============================================================================
// Job failure and error log helpers
// ============================================================================

async function createOrgAuthToken(orgSlug: string = 'openstax'): Promise<string> {
    const privateKeyPem = await readTestSupportFile('private_key.pem')
    const payload = {
        iss: orgSlug,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    }
    const token = jwt.sign(payload, privateKeyPem, { algorithm: 'RS256' })
    return `Bearer ${token}`
}

function extractStudyIdFromUrl(page: Page): string {
    const url = page.url()
    const match = url.match(/\/study\/([^/]+)/)
    if (!match) throw new Error(`Could not extract study ID from URL: ${url}`)
    return match[1]
}

async function waitForJobReady(page: Page, studyId: string, authToken: string): Promise<string> {
    const baseUrl = 'http://localhost:4000'
    for (let i = 0; i < 60; i++) {
        const response = await page.request.get(`${baseUrl}/api/studies/ready`, {
            headers: { Authorization: authToken },
        })
        if (response.ok()) {
            const data = (await response.json()) as { jobs: Array<{ studyId: string; jobId: string }> }
            const job = data.jobs?.find((j) => j.studyId === studyId)
            if (job) return job.jobId
        }
        await page.waitForTimeout(1000)
    }
    throw new Error(`Job for study ${studyId} did not become ready within 60 seconds`)
}

function uploadErrorLogs(jobId: string): void {
    // Use the existing debug script to upload error logs
    // This handles encryption and sets status to JOB-ERRORED
    const cmd = `pnpm exec tsx bin/debug/upload-results.ts -j ${jobId} -l tests/assets/error-log.txt`
    execSync(cmd, { stdio: 'inherit' })
}

async function reviewerApprovesErrorLogs(page: Page, studyTitle: string): Promise<void> {
    await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
    await expect(page.getByText('Review Studies')).toBeVisible()

    // Code was already reviewed — no agreements redirect, go directly to code review
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    // Enter the private key to decrypt files
    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByPlaceholder('Enter your Reviewer key to access encrypted content.')
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    // Click "Decrypt Files" to decrypt
    const decryptButton = page.getByRole('button', { name: /Decrypt Files/i })
    await expect(decryptButton).toBeEnabled()
    await decryptButton.click()

    // Wait for decryption to complete — View buttons appear in the file table
    await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible()

    // Select the error log file to share with the researcher
    const checkbox = page.getByRole('checkbox', { name: /Select Code Run Log/i })
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    // Wait for approve button to be enabled and click it
    const approveButton = page.getByRole('button', { name: /approve/i }).last()
    await expect(approveButton).toBeEnabled()
    await approveButton.click()

    // Wait for mutation to complete and redirect to dashboard
    await page.waitForURL('**/dashboard')

    // Full-page reload clears Router Cache so study details re-fetches from DB
    await goto(page, '/openstax/dashboard')
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)
    await expect(page.getByText(/Approved on/).last()).toBeVisible()
}

async function verifyFailedStatusDisplay(page: Page, studyTitle: string): Promise<void> {
    // Check dashboard shows "Errored" status
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
    await expect(studyRow.getByText(/Errored/i)).toBeVisible()

    // Navigate to study details
    await viewStudyDetails(page, studyTitle)

    // Verify error message
    await expect(page.getByText(/The code errored/i)).toBeVisible()

    // Verify Job ID is displayed
    await expect(page.getByText(/Job ID/i)).toBeVisible()

    // Verify logs section exists (async-loaded via JobResults)
    await expect(page.getByText(/Code Run Log:/i)).toBeVisible()
}

// ============================================================================
// Resubmit helpers
// ============================================================================

async function resubmitCodeViaFileUpload(page: Page, mainCodeFile: string): Promise<string> {
    // Scroll to the bottom of the page to reveal the resubmit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    // Click the resubmit button on the study details page
    const resubmitLink = page.getByRole('link', { name: /Resubmit study code/i })
    await expect(resubmitLink).toBeVisible()
    await resubmitLink.click()

    // Wait for resubmit page to load. The redesigned page header reads
    // "Edit study code"; the bottom action button is still labelled
    // "Resubmit study code" (clicked later, via the file-upload form).
    await expect(page.getByRole('heading', { name: /Edit study code/i })).toBeVisible()

    // Upload files via the file input in the drop overlay
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([mainCodeFile, 'tests/fixtures/code-samples/code.r'])

    const mainFileName = mainCodeFile.split('/').pop()!
    await expect(page.getByText(mainFileName).first()).toBeVisible()

    // The Resubmit button is gated on a non-empty resubmission note. Fill it
    // before attempting to enable the button.
    await page.getByLabel(/Resubmission Note/i).fill('Updated code per reviewer feedback.')

    // Resubmit footer: click "Resubmit study code" → confirm modal → "Yes, resubmit study code".
    const resubmitButton = page.getByRole('button', { name: /^Resubmit study code$/i })
    await expect(resubmitButton).toBeEnabled()
    await resubmitButton.click()
    await page.getByRole('button', { name: /^Yes, resubmit study code$/i }).click()

    // Wait for redirect
    await page.waitForURL('**/view')

    return mainFileName
}

// ============================================================================
// Tests
// ============================================================================

test('Study creation via file upload', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('file-upload')
    let studyId: string

    await test.step('researcher selects org and language (Step 1)', async () => {
        await navigateToProposeStudy(page, studyTitle)
    })

    await test.step('researcher fills and submits proposal (Step 2)', async () => {
        await fillAndSubmitProposal(page, studyTitle)
    })

    await test.step('reviewer approves proposal', async () => {
        await reviewerApprovesProposal(page, studyTitle)
    })

    await test.step('researcher navigates to code upload via agreements', async () => {
        await researcherNavigatesToCodeUpload(page, studyTitle)
    })

    await test.step('researcher uploads code files and submits', async () => {
        await uploadCodeViaFileUpload(page, 'tests/fixtures/code-samples/main.r')
    })

    await test.step('researcher verifies study in dashboard', async () => {
        await goto(page, '/openstax-lab/dashboard')
        await viewStudyDetails(page, studyTitle)
        studyId = extractStudyIdFromUrl(page)
        await goto(page, `/openstax-lab/study/${studyId}/view`)
        // PENDING-REVIEW + CODE-SUBMITTED renders CodePostSubmissionView (OTTER-563).
        await expect(page.getByRole('heading', { name: /^Study code/ })).toBeVisible()
        await expect(page.getByTestId('code-under-review-banner')).toBeVisible()
    })

    await test.step('researcher navigates back via previous buttons', async () => {
        // CodePostSubmissionView has a "Back" link that returns to the agreements page.
        const previousLink = page.getByRole('link', { name: /^Back$/i })
        await previousLink.scrollIntoViewIfNeeded()
        await previousLink.click()
        await page.waitForURL(/\/agreements\?from=previous/)
    })

    await test.step('reviewer approves code', async () => {
        await reviewerApprovesCode(page, studyTitle)
    })

    await test.step('simulate job failure with error logs', async () => {
        const authToken = await createOrgAuthToken('openstax')

        const jobId = await waitForJobReady(page, studyId, authToken)

        uploadErrorLogs(jobId)
    })

    await test.step('reviewer approves error logs', async () => {
        await reviewerApprovesErrorLogs(page, studyTitle)
    })

    await test.step('researcher verifies failed status and logs on dashboard', async () => {
        await verifyFailedStatusDisplay(page, studyTitle)
    })

    await test.step('researcher resubmits code via file upload', async () => {
        // Already on study details page from verifyFailedStatusDisplay
        await resubmitCodeViaFileUpload(page, 'tests/fixtures/code-samples/main.r')
    })
})

test('Study creation via IDE', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('IDE')
    let studyId: string

    await test.step('researcher selects org and language (Step 1)', async () => {
        await navigateToProposeStudy(page, studyTitle)
    })

    await test.step('researcher fills and submits proposal (Step 2)', async () => {
        await fillAndSubmitProposal(page, studyTitle)
    })

    await test.step('reviewer approves proposal', async () => {
        await reviewerApprovesProposal(page, studyTitle)
    })

    await test.step('researcher navigates to code upload via agreements', async () => {
        await researcherNavigatesToCodeUpload(page, studyTitle)
    })

    await test.step('researcher uploads code via IDE and submits', async () => {
        await uploadCodeViaIDE(page)
    })

    await test.step('researcher verifies study in dashboard', async () => {
        await goto(page, '/openstax-lab/dashboard')
        await viewStudyDetails(page, studyTitle)
        // PENDING-REVIEW + CODE-SUBMITTED renders CodePostSubmissionView (OTTER-563).
        await expect(page.getByRole('heading', { name: /^Study code/ })).toBeVisible()
        await expect(page.getByTestId('code-under-review-banner')).toBeVisible()
        studyId = extractStudyIdFromUrl(page)
    })

    await test.step('reviewer approves code', async () => {
        await reviewerApprovesCode(page, studyTitle)
    })

    await test.step('simulate job failure with error logs', async () => {
        const authToken = await createOrgAuthToken('openstax')

        const jobId = await waitForJobReady(page, studyId, authToken)

        uploadErrorLogs(jobId)
    })

    await test.step('reviewer approves error logs', async () => {
        await reviewerApprovesErrorLogs(page, studyTitle)
    })

    await test.step('researcher verifies failed status and logs on dashboard', async () => {
        await verifyFailedStatusDisplay(page, studyTitle)
    })
})

test('Proposal rejection', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('prop-rej')

    await test.step('researcher creates study', async () => {
        await navigateToProposeStudy(page, studyTitle)
        await fillAndSubmitProposal(page, studyTitle)
    })

    await test.step('reviewer rejects proposal', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await clickViewLink(page, studyRow)

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible()
        await expect(page.getByText(studyTitle)).toBeVisible()

        // Redesigned ProposalReviewView: feedback + Reject decision + modal confirm.
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
    })

    await test.step('reviewer sees rejected status on dashboard', async () => {
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await expect(studyRow.getByText(/REJECTED/i)).toBeVisible()
    })

    await test.step('researcher sees rejected status on dashboard', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await expect(studyRow.getByText(/REJECTED/i)).toBeVisible()
    })

    await test.step('researcher views rejected study and sees post-submission view', async () => {
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // POST_SUBMISSION_STATUSES without job activity now route to /submitted
        // (useStudyHref change from the OpenStax-flag removal).
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByRole('heading', { name: 'Study proposal' })).toBeVisible()
        // The title appears in the breadcrumb link and a Text node — match either.
        await expect(page.getByText(studyTitle).first()).toBeVisible()
        await expect(page.getByText(/Rejected on/)).toBeVisible()

        // Rejected proposals get a single "Go to dashboard" CTA — no Step-3 progression.
        await expect(page.getByRole('button', { name: /Proceed to Step 3/i })).not.toBeVisible()
        await expect(page.getByRole('link', { name: /Go to dashboard/i })).toBeVisible()
    })
})

test('Code rejection and resubmission', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-rej')
    let studyId: string

    await test.step('researcher creates study and proposal is approved', async () => {
        await navigateToProposeStudy(page, studyTitle)
        await fillAndSubmitProposal(page, studyTitle)
        await reviewerApprovesProposal(page, studyTitle)
    })

    await test.step('researcher uploads code and submits', async () => {
        await researcherNavigatesToCodeUpload(page, studyTitle)
        await uploadCodeViaFileUpload(page, 'tests/fixtures/code-samples/main.r')
    })

    await test.step('reviewer waits for code scan and rejects code', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        await viewStudyDetails(page, studyTitle)

        // Reviewer is auto-redirected to agreements when code has been submitted
        await page.waitForURL(/\/agreements(\?.*)?$/, { timeout: 10000 })
        const studyBaseUrl = page.url().replace(/\/agreements(\?.*)?$/, '')

        // Navigate to code review via agreements-proceed to bypass the agreements redirect
        await goto(page, `${studyBaseUrl}/review?from=agreements-proceed`)

        // Redesigned CodeReviewClient: fill criteria, pick "Request revision"
        // (decision: needs-clarification, → CODE-CHANGES-REQUESTED so the
        // researcher can resubmit), leave feedback, confirm via the standard modal.
        // The plain inline "Reject" button is gone with the feature-flag removal.
        const criteriaKeys = ['proposalAlignment', 'agreementCompliance', 'securityChecks', 'privacyProtection']
        for (const key of criteriaKeys) {
            await page.locator(`input[name="criteria-${key}"][value="no"]`).check()
        }

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
        await goto(page, '/openstax/dashboard')
    })

    await test.step('reviewer sees change-requested status on dashboard', async () => {
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await expect(studyRow.getByText(/Change requested/i)).toBeVisible()
    })

    await test.step('researcher sees change-requested status and edit-and-resubmit CTA', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // Redesigned CodePostDecisionView surfaces the change-requested banner
        // and an "Edit and resubmit" CTA (testid cta-edit-and-resubmit) that
        // links to /resubmit.
        await expect(page.getByTestId('decision-banner-code-change-requested')).toBeVisible()
        await expect(page.getByTestId('cta-edit-and-resubmit')).toBeVisible()
        studyId = extractStudyIdFromUrl(page)
    })

    await test.step('researcher resubmits code', async () => {
        await goto(page, `/openstax-lab/study/${studyId}/resubmit`)

        await expect(page.getByRole('heading', { name: /Edit study code/i })).toBeVisible()

        // Upload files via the file input in the drop overlay
        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(['tests/fixtures/code-samples/main.r', 'tests/fixtures/code-samples/code.r'])

        // The Resubmit button is gated on a non-empty resubmission note.
        await page.getByLabel(/Resubmission Note/i).fill('Updated code per reviewer feedback.')

        // Resubmit footer: click "Resubmit study code" → confirm modal → "Yes, resubmit study code".
        const resubmitButton = page.getByRole('button', { name: /^Resubmit study code$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page.getByRole('button', { name: /^Yes, resubmit study code$/i }).click()

        await page.waitForURL('**/view')
    })
})

test('ProposalReviewView for study without code', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('proposal-only')

    await test.step('researcher creates study', async () => {
        await navigateToProposeStudy(page, studyTitle)
        await fillAndSubmitProposal(page, studyTitle)
    })

    await test.step('reviewer sees ProposalReviewView', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible()
        // "Review initial request" appears as both the page h1 and the section h4;
        // pin to the h1 to keep the assertion unambiguous.
        await expect(page.getByRole('heading', { name: /Review initial request/i, level: 1 })).toBeVisible()

        // Field labels are rendered inside the (initially expanded) proposal body.
        // "Study title" used to be its own label on the legacy view; the redesign
        // moves the title into the section header instead, so don't assert that label.
        await expect(page.getByText('Research question(s)', { exact: true })).toBeVisible()
        await expect(page.getByText('Project summary', { exact: true })).toBeVisible()
        await expect(page.getByText('Impact', { exact: true })).toBeVisible()
        await expect(page.getByText('Principal Investigator', { exact: true })).toBeVisible()

        // Redesigned ProposalReviewView surfaces a Submit review action and
        // the decision radio group (Approve / Reject / etc.) instead of
        // inline "Approve request" / "Reject request" buttons.
        await expect(page.getByRole('button', { name: /^Submit review$/i })).toBeVisible()
        const decisionSection = page.getByTestId('review-decision-section')
        await expect(decisionSection.getByRole('radio', { name: /^Approve$/i })).toBeVisible()
        await expect(decisionSection.getByRole('radio', { name: /^Reject$/i })).toBeVisible()
    })
})
