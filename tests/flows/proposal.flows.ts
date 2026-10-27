// Shared page flows (researcher Step 1 + Step 2): plain functions that take a `page`. They are tier-agnostic by
// rule (eslint.config.mjs): no database, no server modules, no environment, so the hermetic suite and
// the deployed suite drive the same screens the same way. Moved verbatim out of tests/study-flow.spec.ts;
// every submit-shaped flow is still driven live by exactly ONE owning test per tier, and every other
// test reaches that state through seeding.

import { expect, type Page } from '@playwright/test'
import { visitAsRole } from './page'
import { fillLexicalField, insertLexicalLink } from './lexical'
import { RESEARCHER_DASHBOARD } from './dashboard.flows'

// OTTER-463: rich-text links must carry target="_blank" through submission so
// neither researcher nor reviewer gets navigated off SafeInsights by a click.
export const PROPOSAL_LINK_TEXT = 'Prior study writeup'
export const PROPOSAL_LINK_URL = 'https://example.com/prior-study'

// OTTER-690: Step 1 is one card, and the study title is entered here rather than on Step 2.
export async function fillStep1(
    page: Page,
    studyTitle: string,
    orgNameRegex: RegExp = /openstax/i,
    language: 'R' | 'Python' = 'R',
) {
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
    const radioButton = page.getByRole('radio', { name: language, exact: true })
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
