// Shared page flows (researcher code upload and resubmit): plain functions that take a `page`. They are tier-agnostic by
// rule (eslint.config.mjs): no database, no server modules, no environment, so the hermetic suite and
// the deployed suite drive the same screens the same way. Moved verbatim out of tests/study-flow.spec.ts;
// every submit-shaped flow is still driven live by exactly ONE owning test per tier, and every other
// test reaches that state through seeding.

import { expect, type Page } from '@playwright/test'
import { goto, visitAsRole } from './page'
import { fillLexicalField } from './lexical'
import { RESEARCHER_DASHBOARD, clickViewLink } from './dashboard.flows'

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
export async function uploadAndExpectFiles(page: Page, filePaths: string[]) {
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
