import {
    expect,
    visitAsRole,
    readTestSupportFile,
    fillLexicalField,
    insertLexicalLink,
    typeIntoLexical,
    goto,
    type Page,
} from './e2e.helpers'
import { execSync } from 'child_process'

export const RESEARCHER_DASHBOARD = '/openstax-lab/dashboard'
export const REVIEWER_DASHBOARD = '/openstax/dashboard'

// OTTER-463: rich-text links must carry target="_blank" through submission so
// neither researcher nor reviewer gets navigated off SafeInsights by a click.
export const PROPOSAL_LINK_TEXT = 'Prior study writeup'
export const PROPOSAL_LINK_URL = 'https://example.com/prior-study'

// OTTER-690: Step 1 is one card, and the study title is entered here rather than on Step 2.
export async function fillStep1(page: Page, studyTitle: string, orgNameRegex: RegExp = /openstax/i) {
    await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up study', level: 2 })).toBeVisible()

    await page.getByLabel(/Study title/).fill(studyTitle)

    const orgSelect = page.getByTestId('org-select')
    await expect(orgSelect).toBeEnabled()
    // The Select is keyed on the form field, so a re-initialisation detaches the node mid-click.
    await expect(async () => {
        await orgSelect.click()
    }).toPass()
    await page.getByRole('option', { name: orgNameRegex }).click()

    // Language radios appear after an org is chosen.
    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible' })
    await radioButton.click()
}

// OTTER-764 accessibility: a locked field is not a field that vanished. It keeps its name and its
// value in the accessibility tree as a disabled group, so "no longer editable" has to be asserted
// against the control, never against the label.
export async function expectLockedSetupField(page: Page, label: string, value: string | RegExp) {
    const field = page.getByRole('group', { name: label, exact: true })
    await expect(field).toHaveAttribute('aria-disabled', 'true')
    await expect(field).toHaveAttribute('tabindex', '-1')
    await expect(field.getByText(value, { exact: true })).toBeVisible()
}

// Save & continue now opens a confirmation modal before navigating, because the Data Partner and
// language cannot be changed after this step.
export async function confirmStep1(page: Page) {
    const proceedButton = page.getByRole('button', { name: 'Save & continue' })
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Continue to the next step?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Continue' }).click()
}

export async function navigateToProposeStudy(page: Page, studyTitle: string) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)

    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible' })
    await newStudyButton.click()
    await page.waitForURL(/\/study\/request$/)

    await fillStep1(page, studyTitle)
    await confirmStep1(page)

    await page.waitForURL(/\/proposal$/)
    await expect(page.getByText('Step 2', { exact: true })).toBeVisible()
}

// Not `getByPlaceholder`: Step 2 renders no placeholder text (OTTER-691), so the locator this
// replaced no longer resolves. The id is the plain-HTML stand-in and clicking it bubbles to the
// pills box that owns the dropdown handler. This only works while the field stays visible, which
// the assertions in the required-fields test pin down.
export function datasetsField(page: Page) {
    return page.locator('#datasets')
}

export async function chooseFirstDataset(page: Page) {
    await datasetsField(page).click()
    await page.getByRole('option').first().click()
}

// No title argument: it is supplied on Step 1 now (OTTER-690), and this page no longer renders a
// title field at all. Callers keep their own copy of the title for later dashboard row lookups.
export async function fillAndSubmitProposal(page: Page, opts: { linkNotes?: boolean } = {}) {
    await expect(page.getByLabel('Study Title')).toHaveCount(0)

    await chooseFirstDataset(page)

    await fillLexicalField(page, 'Research question(s)', 'What is the impact of highlighting on student outcomes?')
    await fillLexicalField(page, 'Project summary', 'We analyze archival data to study highlighting behavior.')
    await fillLexicalField(page, 'Impact', 'This research will improve understanding of study habits.')

    if (opts.linkNotes) {
        await insertLexicalLink(page, 'Additional notes or requests', PROPOSAL_LINK_TEXT, PROPOSAL_LINK_URL)
        // Confirm before submitting: an unmarked link here would navigate the
        // researcher out of the app on click.
        await expect(page.locator(`a[href="${PROPOSAL_LINK_URL}"]`)).toHaveAttribute('target', '_blank')

        // OTTER-776: a click on link text opens the card over the link rather than following it.
        await page.locator(`a[href="${PROPOSAL_LINK_URL}"]`).click()
        const linkCard = page.getByRole('dialog', { name: 'Link details' })
        await expect(linkCard).toContainText(PROPOSAL_LINK_URL)
        await expect(linkCard.getByRole('button', { name: 'Edit link' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(linkCard).toBeHidden()
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

    await expect(page.getByTestId('status-alert')).toContainText('Proposal submitted to')

    // The Data Partner holds the next move, so the exit is the solid action (OTTER-673).
    await page.getByRole('link', { name: /Back to my studies/i }).click()
    await page.waitForURL('/dashboard')
}

// From an APPROVED-no-code study's dashboard, walk View -> /submitted -> /code so the upload surface
// is reached the way the app routes a real user. OTTER-727 removed the /agreements/researcher hop
// that used to sit in the middle.
export async function navigateToCodeUpload(page: Page, studyTitle: string) {
    await visitAsRole(page, RESEARCHER_DASHBOARD)
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await clickViewLink(page, studyRow)

    await page.waitForURL(/\/submitted(\?.*)?$/)

    // OTTER-673: the approved proposal steps back to the read-only Step 1 record and forward again
    // before "Next step" opens Step 3.
    await page.getByRole('link', { name: /Previous step/i }).click()
    await page.waitForURL(/\/edit(\?.*)?$/)
    await page.getByRole('button', { name: 'Next step' }).click()
    await page.waitForURL(/\/submitted(\?.*)?$/)
    await page.getByRole('link', { name: /^Next step$/i }).click()
    await page.waitForURL(/\/code$/)
    // Render signal, not just a URL signal: the callers below immediately reach for controls
    // inside the card. Role-scoped because the footer button shares the label.
    await expect(page.getByRole('heading', { name: 'Submit code', level: 2 })).toBeVisible()
}

// Server actions run one at a time, so the uploads queue behind the page's own data loads and the
// table settles only after several round trips. Retried as a block until both rows show.
async function uploadAndExpectFiles(page: Page, filePaths: string[]) {
    await page.locator('input[type="file"]').setInputFiles(filePaths)
    await expect(async () => {
        for (const filePath of filePaths) {
            // By the view button, not the cell: this table makes the file name the control that opens
            // the preview. `exact` throughout this file for anything naming a file: Playwright matches
            // accessible names as case-insensitive substrings by default.
            const name = `View ${filePath.split('/').pop()}`
            await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
        }
    }).toPass()
}

export async function uploadCodeViaFileUpload(page: Page, mainCodeFile: string) {
    // analysis.r avoids colliding with the Main.R template on case-insensitive macOS filesystems.
    await uploadAndExpectFiles(page, [mainCodeFile, 'tests/fixtures/code-samples/code.r'])
    const mainFileName = mainCodeFile.split('/').pop()!

    // main file must be picked explicitly when multiple files are present.
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    // `radio`, not `button`: this table is a radiogroup.
    await expect(async () => {
        await page.getByRole('radio', { name: `Set ${mainFileName} as main file`, exact: true }).click()
        await expect(page.getByRole('radio', { name: `${mainFileName} is the main file`, exact: true })).toBeVisible()
    }).toPass()

    const submitButton = page.getByRole('button', { name: /Submit code/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Exact and dialog-scoped: Playwright matches names as substrings, and the page's own button is behind it.
    const confirmDialog = page.getByRole('dialog', { name: 'Submit code for review?' })
    const confirmButton = confirmDialog.getByRole('button', { name: 'Submit code', exact: true })
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Code submission redirects to CodePostSubmissionView; wait on its banner (it
    // only appears after the mutation completes), not a URL change.
    await expect(page.getByTestId('status-alert')).toContainText('Code submitted to')

    return mainFileName
}

// Resubmit upload: two files, no star click. insertSubmittedJob seeds analysis.r as MAIN-CODE;
// asserting that star is already selected is what proves inheritance. Clicking it would
// set an override and hide a broken inheritance rule.
export async function uploadResubmitFilesExpectingInheritedMain(page: Page) {
    // /resubmit renders the same table as /code, so the same selectors apply.
    await uploadAndExpectFiles(page, ['tests/fixtures/code-samples/analysis.r', 'tests/fixtures/code-samples/code.r'])
    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/code-samples/analysis.r')
    const replaceDialog = page.getByRole('dialog', { name: 'Replace existing file?' })
    await expect(replaceDialog).toContainText('A file named analysis.r already exists')
    await replaceDialog.getByRole('button', { name: 'Replace', exact: true }).click()
    await expect(replaceDialog).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'analysis.r is the main file', exact: true })).toBeVisible()
}

// The study title is the row's only link (OTTER-617).
export async function clickViewLink(page: Page, studyRow: ReturnType<Page['getByRole']>) {
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await studyRow.getByRole('link').first().click()
    }).toPass()
}

export async function viewStudyDetails(page: Page, studyTitle: string) {
    // Exclude only the top-level "Proposal draft" pill (case-sensitive) — `hasNotText`
    // is case-insensitive and would also drop intermediate states like "Code draft".
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await clickViewLink(page, studyRow)
    await page.waitForURL(/\/study\//)
}

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

const CODE_CRITERIA_KEYS = ['proposalAlignment', 'agreementCompliance', 'privacyProtection']

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

async function fillCodeCriteria(page: Page, value: 'yes' | 'no') {
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

// The debug script defaults its base URL to :4000 (dev); point it at the Playwright app
// instance instead (E2E_BASE_URL, default :4100).
const DEBUG_UPLOAD_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4100'

export function uploadErrorLogs(jobId: string): void {
    // Debug script encrypts the log with the test key, POSTs it, and sets JOB-ERRORED.
    execSync(
        `pnpm exec tsx bin/debug/upload-results.ts -j ${jobId} -l tests/assets/error-log.txt -u ${DEBUG_UPLOAD_URL}`,
        {
            stdio: 'inherit',
        },
    )
}

export function uploadResults(jobId: string): void {
    // Same script, but uploads an encrypted result (RUN-COMPLETE) — the success counterpart.
    execSync(
        `pnpm exec tsx bin/debug/upload-results.ts -j ${jobId} -r tests/assets/results-with-pii.csv -u ${DEBUG_UPLOAD_URL}`,
        { stdio: 'inherit' },
    )
}

// OTTER-668 + OTTER-676: the outputs-available screen, both phases. Like the errored screen,
// a validated key swaps the form for the outputs table and Decision section on the same URL —
// decryption is client-side, so the swap is a local phase flip, not a navigation.
export async function reviewerDecryptsAvailableOutputs(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByText(/Outputs are available for review/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View', exact: true })
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
export async function reviewerDecryptsErrorLogs(page: Page, studyTitle: string): Promise<void> {
    await visitAsRole(page, REVIEWER_DASHBOARD)
    await expect(page.getByText('Studies for review')).toBeVisible()
    await viewStudyDetails(page, studyTitle)
    await page.waitForURL(/\/review$/)

    await expect(page.getByRole('heading', { name: /security key/i })).toBeVisible()

    const privateKey = await readTestSupportFile('private_key.pem')
    const privateKeyTextarea = page.getByRole('textbox', { name: 'Security key' })
    await expect(privateKeyTextarea).toBeVisible()
    await privateKeyTextarea.fill(privateKey)

    const viewButton = page.getByRole('button', { name: 'View', exact: true })
    await expect(viewButton).toBeEnabled()
    await viewButton.click()

    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
    await expect(page.getByText('Review the outputs before sharing')).toBeVisible()
}

// OTTER-675: submitting the decision from the decrypted view. Shares the outputs so the
// researcher-side assertions below have something to see.
export async function reviewerSharesOutputs(page: Page, feedback: string): Promise<void> {
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
export async function verifyOutputsSharedDisplay(page: Page, studyTitle: string): Promise<void> {
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
    await privateKeyTextarea.fill(await readTestSupportFile('private_key.pem'))

    const viewButton = page.getByRole('button', { name: 'View', exact: true })
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

export async function researcherResubmitsCode(page: Page, studyId: string, note: string) {
    await goto(page, `/openstax-lab/study/${studyId}/resubmit`)
    await expect(page.getByRole('heading', { name: 'Edit code', level: 2 })).toBeVisible()

    await uploadResubmitFilesExpectingInheritedMain(page)

    await fillLexicalField(page, 'Resubmission note', note)

    const resubmitButton = page.getByRole('button', { name: /^Resubmit code for review$/i })
    await expect(page.getByText(/All changes saved/i)).toBeVisible()
    await resubmitButton.click()
    await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Resubmit code$/i })
        .click()

    await page.waitForURL('**/view')
}
