// Shared page flows (outputs review: decrypt, decide, researcher view): plain functions that take a `page`. They are tier-agnostic by
// rule (eslint.config.mjs): no database, no server modules, no environment, so the hermetic suite and
// the deployed suite drive the same screens the same way. Moved verbatim out of tests/study-flow.spec.ts;
// every submit-shaped flow is still driven live by exactly ONE owning test per tier, and every other
// test reaches that state through seeding.

import { expect, type Page } from '@playwright/test'
import { visitAsRole } from './page'
import { RESEARCHER_DASHBOARD, REVIEWER_DASHBOARD, viewStudyDetails } from './dashboard.flows'

// The two radios of the outputs decision (src/components/study/outputs-decision-section.tsx).
export type OutputsDecision = 'share-outputs' | 'share-feedback-only'

// The confirmation modal names what is about to happen before anything is written.
const DECISION_MODAL_COPY: Record<OutputsDecision, RegExp> = {
    'share-outputs': /You are sharing the output files and your feedback with/,
    'share-feedback-only': /You are sharing your feedback only/,
}

// OTTER-668 + OTTER-676: the outputs-available screen, both phases. Like the errored screen,
// a validated key swaps the form for the outputs table and Decision section on the same URL —
// decryption is client-side, so the swap is a local phase flip, not a navigation.
export async function reviewerDecryptsAvailableOutputs(
    page: Page,
    studyTitle: string,
    privateKey: string,
): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByText(/Outputs are available for review/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View' })
    await expect(viewButton).toBeEnabled()
    await viewButton.click()

    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
    await expect(page.getByText('Review the outputs before sharing')).toBeVisible()
}

// Playwright counts the table's opacity-0 empty state as visible until css hides it.
export async function reviewerPreviewsCsvOutput(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'results-with-pii.csv', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: /results-with-pii\.csv/ })
    await expect(dialog.getByRole('cell', { name: 'john.doe@example.com' })).toBeVisible()
    await expect(dialog.getByText('This file has no rows')).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
}

// OTTER-667 + OTTER-675: the errored outputs screen, both phases. The key form gives way to
// the outputs table and Decision section without a navigation, because decryption is client-side, so
// the swap is a local phase flip on the same URL.
export async function reviewerDecryptsErrorLogs(page: Page, studyTitle: string, privateKey: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

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
export async function reviewerSharesOutputs(
    page: Page,
    feedback: string,
    decision: OutputsDecision = 'share-outputs',
): Promise<void> {
    await expect(page.getByTestId('outputs-decision-section')).toBeVisible()

    const editor = page.getByLabel('Decision feedback')
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.fill(feedback)

    await page.getByTestId(`outputs-decision-${decision}`).check()

    const trigger = page.getByTestId('outputs-submit-decision')
    await trigger.click()

    // Scope to the dialog: the page's own trigger and the modal's confirm share the label
    // "Submit decision", so an unscoped role query matches both once the modal is open.
    const modal = page.getByRole('dialog', { name: 'Submit your decision?' })
    await expect(modal).toBeVisible()
    // The modal names what is about to be shared before anything is written.
    await expect(modal.getByText(DECISION_MODAL_COPY[decision])).toBeVisible()

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
export async function reviewerSeesValidationOnBlankSubmit(page: Page): Promise<void> {
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
export async function verifyErroredOutputsSharedDisplay(page: Page, studyTitle: string): Promise<void> {
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

// The only end-to-end check of the server/client boundary on this screen: the reviewer leg shares
// for real, so private_key.pem genuinely opens the wrapped keys (OTTER-688).
export async function verifyOutputsSharedDisplay(page: Page, studyTitle: string, privateKey: string): Promise<void> {
    await visitAsRole(page, RESEARCHER_DASHBOARD)
    // Released but unread, so the badge still asks the researcher to look (OTTER-698).
    await expect(page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs need review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)

    await expect(page.getByRole('heading', { level: 2, name: 'Verify outputs' })).toBeVisible()
    await expect(page.getByText(/Decrypt to view your outputs/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /Previous step/i })).toBeVisible()

    // Pre-decryption: the terminal actions are not in the DOM yet.
    await expect(page.getByRole('link', { name: /Edit code/i })).toBeHidden()
    await expect(page.getByRole('link', { name: /Back to my studies/i })).toBeHidden()

    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View' })
    await expect(viewButton).toBeEnabled()
    await viewButton.click()

    // Post-decryption: success banner, the outputs table, and all three nav actions.
    await expect(page.getByText(/Outputs and feedback available/i)).toBeVisible()
    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Security key' })).toBeHidden()
    await expect(page.getByRole('link', { name: /Previous step/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Edit code/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Back to my studies/i })).toBeVisible()
}

// OTTER-698: the outputs badge is the one status a reader's own visit writes. Opening the decision
// records RESULTS-VIEWED on the job, which turns "Outputs need review" into "Outputs reviewed".
// Only end-to-end can show it: the screen mounts a client leaf, the leaf calls a server action, and
// the dashboard's own query is what reads the result back.
//
// Reloaded inside toPass because the write is fired on mount rather than awaited by the page, so a
// dashboard loaded in the same instant can legitimately still read the row as unread. The dashboard
// does not poll a decided study, so retrying the assertion alone would never see the new value.
export async function verifyOutputsViewedBadge(page: Page, studyTitle: string): Promise<void> {
    await expect(async () => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        await expect(page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs reviewed')).toBeVisible()
    }).toPass()
}

// The server refuses the second decision. The client reconciles against the job rather than
// reporting a failure the reviewer could retry, so the review closes instead.
export async function peerSubmitAfterDecisionClosesTheRound(page: Page): Promise<void> {
    await page.getByTestId('outputs-decision-share-outputs').check()

    await page.getByTestId('outputs-submit-decision').click()

    const modal = page.getByRole('dialog', { name: 'Submit your decision?' })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Submit decision' }).click()

    await expect(page.getByText(/A decision has been submitted for this output/)).toBeVisible()
    // "Try again" would be untrue here: no retry can reopen a decided round.
    await expect(page.getByText('Decision could not be submitted')).toBeHidden()
    await expect(page.getByTestId('outputs-decision-section')).toBeHidden()
}
