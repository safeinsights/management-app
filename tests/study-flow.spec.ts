import type { APIRequestContext } from '@playwright/test'
import {
    expect,
    test,
    visitAsRole,
    readTestSupportFile,
    fillLexicalField,
    typeIntoLexical,
    goto,
    openContextWithSavedRole,
    withRole,
} from './e2e.helpers'
import {
    seedApprovedNoCode,
    seedCodeApprovedJobReady,
    seedCodeResultsReady,
    seedCodeRejected,
    seedCodeChangeRequested,
    seedCodeResubmitted,
    seedCodeSubmitted,
    seedProposalPendingReview,
    SEEDED_RESUBMISSION_NOTE,
    seededFullName,
} from './e2e.seed'
import { createEnclaveClient } from './api/enclave-client'
import { RESEARCHER_DASHBOARD, REVIEWER_DASHBOARD, clickViewLink, viewStudyDetails } from './flows/dashboard.flows'
import {
    PROPOSAL_LINK_TEXT,
    PROPOSAL_LINK_URL,
    chooseFirstDataset,
    confirmStep1,
    datasetsField,
    expectLockedSetupField,
    fillAndSubmitProposal,
    fillStep1,
    navigateToProposeStudy,
} from './flows/proposal.flows'
import {
    navigateToCodeUpload,
    researcherResubmitsCode,
    uploadCodeViaFileUpload,
    uploadResubmitFilesExpectingInheritedMain,
} from './flows/code.flows'
import {
    openCodeReviewEditor,
    reviewerApprovesCode,
    reviewerApprovesProposal,
    reviewerRequestsCodeRevision,
} from './flows/review.flows'
import {
    peerSubmitAfterDecisionClosesTheRound,
    reviewerDecryptsAvailableOutputs,
    reviewerDecryptsErrorLogs,
    reviewerPreviewsCsvOutput,
    reviewerSeesValidationOnBlankSubmit,
    reviewerSharesOutputs,
    verifyErroredOutputsSharedDisplay,
    verifyOutputsSharedDisplay,
    verifyOutputsViewedBadge,
} from './flows/outputs.flows'

// E2e study-lifecycle coverage. Governing rule: every distinct UI surface is
// exercised live by at least ONE test; every other test seeds that state (via
// tests/e2e.seed.ts) and drives only the surface it owns. Auth is per-role
// storageState (tests/global.setup.ts) — tests never sign in; they open a context
// per role with `withRole`, which restores the saved session.
//
// There is no external job runner on CI: result/error flows seed a JOB-READY job
// (which `/api/studies/ready` recognises from the DB alone) and upload an encrypted
// file through the in-process enclave client, then drive the real reviewer decrypt+approve UI.
// The page flows themselves live in tests/flows so the deployed-tier suite drives the same screens.

// The enclave's upload, played in-process: encrypted with the test key every seeded user holds and
// POSTed to /api/job/:id/results, which records RUN-COMPLETE (a result) or JOB-ERRORED (a log only).
async function uploadResults(request: APIRequestContext, jobId: string) {
    const response = await createEnclaveClient(request).uploadResults(jobId, {
        resultFile: 'tests/assets/results-with-pii.csv',
    })
    expect(response.status(), await response.text()).toBe(200)
}

async function uploadErrorLogs(request: APIRequestContext, jobId: string) {
    const response = await createEnclaveClient(request).uploadResults(jobId, { logFile: 'tests/assets/error-log.txt' })
    expect(response.status(), await response.text()).toBe(200)
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

        // OTTER-764 state 2, taken on the way through so this test walks all three Step 1 states in
        // the order a researcher meets them. The draft exists now, so only the title stays editable
        // and a valid click proceeds without the first-visit confirmation modal.
        await page.getByRole('button', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit(\?.*)?$/)
        await expect(page.getByRole('textbox', { name: /Study title/ })).toHaveValue(studyTitle)
        await expect(page.getByTestId('org-select')).toHaveCount(0)

        const saveAndContinue = page.getByRole('button', { name: 'Save & continue' })
        await expect(saveAndContinue).toBeEnabled()
        await saveAndContinue.click()
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByRole('dialog')).toHaveCount(0)

        await fillAndSubmitProposal(page, { linkNotes: true })

        // The read-only render of a submitted proposal is a separate Lexical mount, so
        // assert the link survives there too and not just in the editor.
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
        await clickViewLink(page, studyRow)
        await page.waitForURL(/\/submitted(\?.*)?$/)

        // This view mounts the proposal collapsed (initialExpanded={false}), so the card shows a
        // snippet and the full body is not rendered until the toggle is clicked.
        await page.getByRole('button', { name: 'View full proposal' }).click()
        const proposalBody = page.getByTestId('proposal-body')
        await expect(proposalBody).toBeVisible()

        const submittedLink = proposalBody.getByRole('link', { name: PROPOSAL_LINK_TEXT })
        await expect(submittedLink).toHaveAttribute('href', PROPOSAL_LINK_URL)
        await expect(submittedLink).toHaveAttribute('target', '_blank')

        // OTTER-776: reading the submitted proposal, the click shows the card and stays on the page.
        const submittedUrl = page.url()
        await submittedLink.click()
        const readOnlyCard = page.getByRole('dialog', { name: 'Link details' })
        await expect(readOnlyCard).toContainText(PROPOSAL_LINK_URL)
        await expect(readOnlyCard.getByRole('button', { name: 'Copy link' })).toBeVisible()
        await expect(page).toHaveURL(submittedUrl)
        await page.keyboard.press('Escape')
        await expect(readOnlyCard).toBeHidden()

        // OTTER-764 state 3 on a proposal genuinely pending review. Step 1 is a record here, so no
        // field has an input left and the CTA only steps forward. The title has been locked since
        // submission, which is what makes the permanent lock outrank state 2's editable title.
        await page.getByRole('link', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit(\?.*)?$/)
        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        await expectLockedSetupField(page, 'Study title', studyTitle)
        await expectLockedSetupField(page, 'Data Partner', /^Openstax$/i)
        await expectLockedSetupField(page, 'Programming language', 'R')
        await expect(page.getByRole('textbox', { name: /Study title/ })).toHaveCount(0)
        await expect(page.getByTestId('org-select')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Save & continue' })).toHaveCount(0)

        const nextStep = page.getByRole('button', { name: 'Next step' })
        await expect(nextStep).toBeEnabled()
        await nextStep.click()
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByTestId('status-alert')).toContainText('Proposal submitted to')
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

        await chooseFirstDataset(page)
        // Close the dropdown so it doesn't overlay the footer buttons.
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option')).toHaveCount(0)

        // Navigate back, which triggers save-on-navigate and flushes Step 2 fields
        // to the study row so draftHasStep2Progress resolves correctly.
        await page.getByRole('button', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit(\?.*)?$/)

        // Revisiting Step 1 keeps the title editable and shows it as saved, while the Data
        // Partner and language are now settled and locked.
        await expect(page.getByRole('textbox', { name: /Study title/ })).toHaveValue(studyTitle)
        await expect(page.getByTestId('org-select')).toHaveCount(0)
        await expect(page.getByRole('radio', { name: 'R', exact: true })).toHaveCount(0)
        await expectLockedSetupField(page, 'Data Partner', /^Openstax$/i)
        await expectLockedSetupField(page, 'Programming language', 'R')
        // The title is still a control in this state, so it is not one of the locked groups.
        await expect(page.getByRole('group', { name: 'Study title', exact: true })).toHaveCount(0)

        // Step 1 has no left action in any state; deleting a draft lives on the dashboard.
        await expect(page.getByRole('button', { name: 'Discard study' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)

        // The revisit CTA saves and moves straight on. Reaching Step 2 is itself the proof that the
        // confirmation modal was skipped: it belongs to the first visit, where the Data Partner and
        // the language were still open to change, and an open modal would hold the navigation.
        const saveAndContinue = page.getByRole('button', { name: 'Save & continue' })
        await expect(saveAndContinue).toBeEnabled()
        await saveAndContinue.click()
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByRole('dialog')).toHaveCount(0)

        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const draftRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(draftRow).toBeVisible()
        await draftRow.getByRole('link', { name: studyTitle }).click()

        // Resumes on Step 2 (/proposal), NOT the Step 1 picker (/edit).
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByText('Step 2', { exact: true })).toBeVisible()
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
        const mainFileName = await uploadCodeViaFileUpload(page, 'tests/fixtures/code-samples/analysis.r')

        // QA's reproduction (OTTER-693): reopening /code after submitting left it fully live, and
        // both a main-file change and a second submission went through.
        const studyId = page.url().match(/\/study\/([^/]+)/)![1]
        await goto(page, `/openstax-lab/study/${studyId}/code`)
        await expect(page.getByRole('radio', { name: `${mainFileName} is the main file`, exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: /submit code for review/i })).toBeHidden()
        await expect(page.getByRole('button', { name: /launch ide/i })).toBeHidden()

        // Confirm the post-submission view renders for the researcher.
        await goto(page, RESEARCHER_DASHBOARD)
        await viewStudyDetails(page, studyTitle)
        await expect(page.getByRole('heading', { name: 'Submit code', level: 2 })).toBeVisible()
        await expect(page.getByTestId('status-alert')).toContainText('Code submitted to')
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
test('Successful results review', async ({ browser, request, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('results')
    const privateKey = await readTestSupportFile('private_key.pem')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    await uploadResults(request, jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerDecryptsAvailableOutputs(page, studyTitle, privateKey)
        await reviewerPreviewsCsvOutput(page)
        await reviewerSeesValidationOnBlankSubmit(page)
        await reviewerSharesOutputs(page, 'Reviewed the outputs — no sensitive or restricted data present.')
    })

    await withRole(browser, 'researcher', async (page) => {
        await verifyOutputsSharedDisplay(page, studyTitle, privateKey)
        await verifyOutputsViewedBadge(page, studyTitle)
    })
})

// OTTER-726: one decision closes the round for every reviewer. Both contexts are the same reviewer,
// which is the case that matters, because the guard is tab identity rather than user identity. The
// second reviewer's own submit is the trigger here: the e2e stack runs no editor service, so the
// live event cannot carry, and the status backstop is what answers. The event path is covered in
// use-submission-redirect-listener.test.ts.
test('A second reviewer who submits after the decision is closed out of the round', async ({
    browser,
    request,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('peer-outputs')
    const privateKey = await readTestSupportFile('private_key.pem')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    await uploadResults(request, jobId!)

    const deciding = await openContextWithSavedRole(browser, 'reviewer')
    const peer = await openContextWithSavedRole(browser, 'reviewer')

    try {
        await reviewerDecryptsAvailableOutputs(deciding.page, studyTitle, privateKey)
        await reviewerDecryptsAvailableOutputs(peer.page, studyTitle, privateKey)

        // Drafted before the decision lands, so the peer is mid-review rather than arriving late.
        await fillLexicalField(peer.page, 'Decision feedback', 'Second reviewer still drafting.')

        await reviewerSharesOutputs(deciding.page, 'Reviewed the outputs, nothing sensitive present.')

        await peerSubmitAfterDecisionClosesTheRound(peer.page)
    } finally {
        await deciding.context.close()
        await peer.context.close()
    }
})

// Owns the errored-outputs surface end to end (OTTER-667 + OTTER-675): decrypt, the
// validation gate, the confirmation modal, and the researcher's view of the shared logs.
test('Error log review', async ({ browser, request, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('error-log')
    const privateKey = await readTestSupportFile('private_key.pem')
    const { jobId } = await seedCodeApprovedJobReady(studyTitle)
    await uploadErrorLogs(request, jobId!)

    await withRole(browser, 'reviewer', async (page) => {
        await reviewerDecryptsErrorLogs(page, studyTitle, privateKey)
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

        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        // The page heading is the study title; "Review proposal" is the section header.
        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Review proposal', level: 2 })).toBeVisible()

        const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
        await expect(feedbackEditor).toBeVisible()
        await typeIntoLexical(
            feedbackEditor,
            'Rejecting this initial request — scope is not aligned with available data.',
        )

        await page
            .getByTestId('review-decision-section')
            .getByRole('radio', { name: /^Decline and end study$/i })
            .check()

        await page.getByRole('button', { name: /^Submit decision$/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Decline and end study$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByTestId('status-alert')).toContainText('Proposal declined')
        await page.getByTestId('cta-back-to-my-studies').click()
        await page.waitForURL('/dashboard')

        // Both roles read the same badge for a declined proposal, which is the stored REJECTED
        // status under the name the spec gives it (OTTER-698).
        const rejectedRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(rejectedRow).toBeVisible()
        await expect(rejectedRow.getByText('Proposal declined')).toBeVisible()
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await expect(studyRow.getByText('Proposal declined')).toBeVisible()

        await studyRow.getByRole('link').first().click()
        // POST_SUBMISSION_STATUSES without job activity route to /submitted.
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
        await expect(page.getByTestId('status-alert')).toContainText('Proposal declined')

        // A declined proposal is terminal: the exit is the only solid action, no Step-3 progression.
        await expect(page.getByRole('link', { name: /^Next step$/i })).not.toBeVisible()
        await expect(page.getByRole('link', { name: /Back to my studies/i })).toBeVisible()

        // OTTER-764: a submitted proposal steps back to Step 1 as a read-only record, and forward
        // again from there. Every field is a locked group by now, so none of them holds a control.
        await page.getByRole('link', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit(\?.*)?$/)
        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        await expectLockedSetupField(page, 'Study title', studyTitle)
        await expectLockedSetupField(page, 'Data Partner', /^Openstax$/i)
        await expectLockedSetupField(page, 'Programming language', 'R')
        await expect(page.getByRole('textbox', { name: /Study title/ })).toHaveCount(0)
        await expect(page.getByTestId('org-select')).toHaveCount(0)

        const nextStep = page.getByRole('button', { name: 'Next step' })
        await expect(nextStep).toBeEnabled()
        await nextStep.click()
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
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

        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()

        const feedbackEditor = page.getByTestId('review-feedback-section').locator('[contenteditable="true"]')
        await expect(feedbackEditor).toBeVisible()
        await typeIntoLexical(
            feedbackEditor,
            'Please clarify the dataset scope and the analysis plan before we can approve.',
        )

        await page
            .getByTestId('review-decision-section')
            .getByRole('radio', { name: /Request revision/i })
            .check()

        await page.getByRole('button', { name: /^Submit decision$/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^Request revision$/i }).click()
        await expect(dialog).toBeHidden()

        await expect(page.getByTestId('status-alert')).toContainText('Revision requested')
        await page.getByTestId('cta-back-to-my-studies').click()
        await page.waitForURL('/dashboard')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link').first().click()

        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByTestId('status-alert')).toContainText('Revision requested')
        studyId = page.url().match(/\/study\/([^/]+)/)![1]

        // OTTER-764: a change-requested proposal steps back to the read-only Step 1 record and
        // forward again, like every other post-submission state. The footer offers the step back
        // rather than an exit, so no control here leads to the dashboard.
        await expect(page.getByTestId('cta-back-to-my-studies')).toHaveCount(0)
        await page.getByRole('link', { name: /Previous step/i }).click()
        await page.waitForURL(/\/edit(\?.*)?$/)
        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        await expectLockedSetupField(page, 'Study title', studyTitle)
        await expectLockedSetupField(page, 'Data Partner', /^Openstax$/i)
        await expectLockedSetupField(page, 'Programming language', 'R')
        await expect(page.getByRole('textbox', { name: /Study title/ })).toHaveCount(0)
        await expect(page.getByTestId('org-select')).toHaveCount(0)

        const forwardToProposal = page.getByRole('button', { name: 'Next step' })
        await expect(forwardToProposal).toBeEnabled()
        await forwardToProposal.click()
        await page.waitForURL(/\/submitted(\?.*)?$/)
        await expect(page.getByTestId('status-alert')).toContainText('Revision requested')

        await page.getByRole('link', { name: /^Edit proposal$/i }).click()
        await page.waitForURL(/\/edit-and-resubmit$/)

        // OTTER-673: Edit proposal steps back to Step 1, whose Next step returns to Edit proposal
        // rather than to the proposal status it was opened from.
        await page.getByRole('button', { name: /^Previous step$/i }).click()
        await page.waitForURL(/\/edit\?from=edit-proposal$/)
        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Next step' }).click()
        await page.waitForURL(/\/edit-and-resubmit$/)

        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Edit proposal', level: 2 })).toBeVisible()
        // Step 1 owns the title, so this page no longer offers a field for it (OTTER-762).
        await expect(page.getByLabel('Study Title')).toHaveCount(0)

        // The form must load the previously-saved proposal values for editing, not
        // empty placeholders. These mirror the content seeded by seedProposalPendingReview.
        await expect(page.getByLabel('Research question(s)')).toContainText(
            'What is the impact of highlighting on student outcomes?',
        )
        await expect(page.getByLabel('Project summary')).toContainText(
            'We analyze archival data to study highlighting behavior.',
        )
        await expect(page.getByLabel('Impact')).toContainText(
            'This research will improve understanding of study habits.',
        )

        // The button is never disabled on validity: clicking with the note empty flags the field
        // instead of opening the modal (OTTER-762).
        const resubmitButton = page.getByRole('button', { name: /^Resubmit proposal$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await expect(page.getByText('Enter your resubmission note before continuing.')).toBeVisible()
        await expect(page.getByRole('dialog')).toBeHidden()

        // Form is pre-filled; only the resubmission note gates submit.
        await fillLexicalField(page, 'Resubmission note', 'Clarified the dataset scope and analysis plan per feedback.')
        await expect(page.getByText('Enter your resubmission note before continuing.')).toBeHidden()

        await resubmitButton.click()
        const resubmitDialog = page.getByRole('dialog')
        await expect(resubmitDialog.getByText('Resubmit your proposal?')).toBeVisible()
        await resubmitDialog.getByRole('button', { name: /^Resubmit proposal$/i }).click()

        await page.waitForURL(/\/submitted(\?.*)?$/)
    })

    await withRole(browser, 'reviewer', async (page) => {
        // Resubmission returns the proposal to PENDING-REVIEW: the editable
        // ProposalReviewView re-opens with a fresh decision section.
        await goto(page, `/openstax/study/${studyId}/review`)
        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
        await expect(page.getByRole('button', { name: /^Submit decision$/i })).toBeVisible()
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

        // OTTER-673: the code step walks back to the decided proposal, which steps forward again.
        await page.getByRole('link', { name: /Previous step/i }).click()
        await page.waitForURL(/\/review\/proposal$/)
        await expect(page.getByTestId('status-alert')).toContainText('Proposal approved')
        await page.getByRole('link', { name: /^Next step$/i }).click()
        await page.waitForURL(/\/review\/code$/)
        await expect(page.getByTestId('code-review-section')).toBeVisible()

        await reviewerRequestsCodeRevision(page, 'Requesting revisions to submitted code — please address criteria.')
        await page.getByTestId('cta-back-to-my-studies').click()
        await page.waitForURL('/dashboard')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link').first().click()

        await expect(page.getByTestId('status-alert')).toContainText('Revision requested on your code')
        studyId = page.url().match(/\/study\/([^/]+)/)![1]

        // OTTER-673: Edit code steps back past the code step to the approved proposal, whose Next
        // step returns to Edit code.
        await page.getByTestId('cta-edit-code').click()
        await page.waitForURL(/\/resubmit$/)
        await page.getByRole('button', { name: /^Previous step$/i }).click()
        await page.waitForURL(/\/submitted\?from=edit-code$/)
        await expect(page.getByTestId('status-alert').filter({ hasText: 'Proposal approved' })).toBeVisible()
        await page.getByRole('link', { name: /^Next step$/i }).click()
        await page.waitForURL(/\/resubmit$/)
        await expect(page.getByRole('heading', { name: 'Edit code', level: 2 })).toBeVisible()

        await researcherResubmitsCode(page, studyId, 'Updated code per reviewer feedback.')
    })
})

// Seeded decisions carry the reviewer, as real ones do, so both dashboards attribute them (OTTER-617).
test('Dashboards name the reviewer who decided on the code', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('reviewed-by')
    await seedCodeChangeRequested(studyTitle)
    const reviewerName = await seededFullName('reviewer')

    await withRole(browser, 'reviewer', async (page) => {
        await visitAsRole(page, REVIEWER_DASHBOARD)
        await expect(page.getByRole('row').filter({ hasText: studyTitle })).toContainText(reviewerName)

        await visitAsRole(page, '/dashboard')
        await expect(page.getByRole('row').filter({ hasText: studyTitle })).toBeVisible()
    })
})

// A change-requested resubmit reuses the job, and the next round used to cost the previous one its
// note (OTTER-802). Seeds the state after the first resubmit and drives one more round.
test('Second code resubmission keeps the earlier round note', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('code-resubmit-again')
    const { studyId } = await seedCodeResubmitted(studyTitle)

    await withRole(browser, 'reviewer', async (page) => {
        await openCodeReviewEditor(page, studyTitle)
        await reviewerRequestsCodeRevision(page, 'The agreements criterion is still not met.')
    })

    await withRole(browser, 'researcher', async (page) => {
        await researcherResubmitsCode(page, studyId, 'Addressed the agreements criterion.')

        const thread = page.getByTestId('feedback-and-notes-section')
        await expect(thread.getByText('Resubmission note (v3.0)')).toBeVisible()
        await expect(thread.getByText('Resubmission note (v2.0)')).toBeVisible()
        await expect(thread).toContainText(SEEDED_RESUBMISSION_NOTE)
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
        await expect(page.getByRole('heading', { name: 'Edit code', level: 2 })).toBeVisible()

        // Seeded jobs have no local workspace files, so /resubmit exercises the empty view.
        const starterLink = page.getByRole('link', { name: 'Starter code', exact: true })
        await expect(starterLink).toBeVisible()
        await expect(starterLink).toHaveAttribute('href', /X-Amz-Signature=/i)
        await expect(starterLink).toHaveAttribute('target', '_blank')

        await uploadResubmitFilesExpectingInheritedMain(page)

        // Filling the note fires the debounced autosave against the real action: the "All changes
        // saved" indicator must appear and no "can no longer be changed" toast. This guards the page +
        // autosave + resubmit wiring on a Results-ready study, NOT the ordering bug itself: this seed
        // is deterministically ordered (FILES-APPROVED newest), so the old at(0) gate would have
        // passed here too. The ordering-triggered failure is covered by the unit tests.
        await fillLexicalField(page, 'Resubmission note', 'Reworked code after the results were approved.')
        await expect(page.getByText(/All changes saved/i)).toBeVisible()
        await expect(page.getByText(/can no longer be changed/i)).toBeHidden()

        const resubmitButton = page.getByRole('button', { name: /^Resubmit code for review$/i })
        await expect(resubmitButton).toBeEnabled()
        await resubmitButton.click()
        await page
            .getByRole('dialog')
            .getByRole('button', { name: /^Resubmit code$/i })
            .click()

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

        await expect(page.getByTestId('status-alert')).toContainText('Code declined')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link').first().click()

        // CODE-REJECTED is terminal: rejected banner + the elevated exit only (no resubmit CTA).
        await expect(page.getByTestId('status-alert')).toContainText('Code declined')
        await expect(page.getByTestId('cta-back-to-my-studies')).toBeVisible()
        await expect(page.getByTestId('cta-edit-code')).not.toBeVisible()
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

        await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
        // The page heading is the study title; "Review proposal" is the section header.
        await expect(page.getByRole('heading', { name: studyTitle, level: 1 })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Review proposal', level: 2 })).toBeVisible()

        await expect(page.getByText('Research question(s)', { exact: true })).toBeVisible()
        await expect(page.getByText('Project summary', { exact: true })).toBeVisible()
        await expect(page.getByText('Impact', { exact: true })).toBeVisible()
        await expect(page.getByText('Principal Investigator', { exact: true })).toBeVisible()

        await expect(page.getByRole('button', { name: /^Submit decision$/i })).toBeVisible()
        const decisionSection = page.getByTestId('review-decision-section')
        await expect(decisionSection.getByRole('radio', { name: /^Approve$/i })).toBeVisible()
        await expect(decisionSection.getByRole('radio', { name: /^Decline and end study$/i })).toBeVisible()
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
        await expect(page.getByText('Step 2', { exact: true })).toBeVisible()

        // Step 2 no longer owns the title, and OTTER-691 removed its placeholders. Asserted on the
        // controls themselves: `getByPlaceholder(...).toHaveCount(0)` also passes when the field is
        // gone, so it would keep passing if the whole page regressed.
        await expect(page.getByLabel('Study Title')).toHaveCount(0)
        // Blank, not absent: Mantine collapses a non-searchable MultiSelect whose placeholder is
        // falsy to a 1px hidden field, so the datasets control carries a single space to stay
        // visible. The regex covers either spelling, and `data-type` is what proves the control
        // is still a real target for the click and the focus jump below.
        await expect(datasetsField(page)).toHaveAttribute('placeholder', /^\s*$/)
        await expect(datasetsField(page)).toHaveAttribute('data-type', 'visible')
        await expect(page.getByRole('textbox', { name: 'Principal Investigator' })).toHaveAttribute('placeholder', '')

        // Its own required fields still flag on blur (OTTER-647), now with per-field wording.
        await datasetsField(page).click()
        await page.keyboard.press('Escape')
        await page.getByRole('textbox', { name: 'Principal Investigator' }).click()
        await expect(page.getByText('Select a dataset of interest before continuing.').first()).toBeVisible()
        await page.keyboard.press('Escape')
        // Leave the field before clicking Submit: its error appearing on blur shifts Submit down
        // between mousedown and mouseup, so the click would never fire.
        await page.keyboard.press('Tab')
        await expect(page.getByText('Select a Principal Investigator before continuing.')).toBeVisible()

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
