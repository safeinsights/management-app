import { expect, goto, test, visitAsRole, withRole } from './e2e.helpers'
import {
    seedApprovedNoCode,
    seedCodeSubmitted,
    seedDraft,
    seedJobStage,
    seedProposalPendingReview,
    type SeededJobStage,
} from './e2e.seed'
import { RESEARCHER_DASHBOARD, REVIEWER_DASHBOARD, clickViewLink, viewStudyDetails } from './flows/dashboard.flows'
import { navigateToCodeUpload, uploadAndExpectFiles } from './flows/code.flows'
import { confirmStep1 } from './flows/proposal.flows'

// The study lifecycle's variants: the states and branches tests/study-flow.spec.ts does not drive.
// Same rule as there: one live test per surface, everything else seeded.

// Owns the Python code path: a Python study's workspace starts from the Python template, the upload is
// chosen as the main file, and the reviewer's viewer opens it. openstax is seeded with both an R and a
// Python code environment.
test('Researcher submits a Python study and the reviewer opens the file', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('python')
    const { studyId } = await seedApprovedNoCode(studyTitle, { language: 'PYTHON' })

    await withRole(browser, 'researcher', async (page) => {
        await navigateToCodeUpload(page, studyTitle)
        // analysis.py: the Python starter is already in the workspace as Main.py, and main.py would
        // collide with it on a case-insensitive filesystem, as analysis.r does for Main.R.
        await uploadAndExpectFiles(page, ['tests/fixtures/code-samples/analysis.py'])
        // Two files now (the template and the upload), so the main one is picked explicitly.
        await expect(async () => {
            await page.getByRole('radio', { name: 'Set analysis.py as main file', exact: true }).click()
            await expect(page.getByRole('radio', { name: 'analysis.py is the main file', exact: true })).toBeVisible()
        }).toPass()

        const submitButton = page.getByRole('button', { name: /Submit code/i })
        await expect(submitButton).toBeEnabled()
        await submitButton.click()
        const confirmDialog = page.getByRole('dialog', { name: 'Submit code for review?' })
        await confirmDialog.getByRole('button', { name: 'Submit code', exact: true }).click()
        await expect(page.getByTestId('status-alert')).toContainText('Code submitted to')
    })

    await withRole(browser, 'reviewer', async (page) => {
        await goto(page, `/openstax/study/${studyId}/review`)
        await expect(page.getByTestId('study-code-file-tab').filter({ hasText: 'analysis.py' })).toBeVisible()
        await expect(page.locator('code').filter({ hasText: 'import pandas as pd' }).first()).toBeVisible()
    })
})

// Owns Step 1 for a Data Partner with one language: the choice is made for the researcher and said so.
test('Step 1 settles the language for a single-language Data Partner', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('single-lang')

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        await page.getByTestId('new-study').first().click()
        await page.waitForURL(/\/study\/request$/)

        await page.getByLabel(/Study title/).fill(studyTitle)
        const orgSelect = page.getByTestId('org-select')
        await expect(orgSelect).toBeEnabled()
        await expect(async () => {
            await orgSelect.click()
        }).toPass()
        await page.getByRole('option', { name: 'Single-Lang R Enclave' }).click()

        await expect(page.getByText('At present, Single-Lang R Enclave only supports R.')).toBeVisible()
        await expect(page.getByRole('radio', { name: 'R', exact: true })).toBeChecked()
        await expect(page.getByRole('radio', { name: 'Python', exact: true })).toHaveCount(0)

        await confirmStep1(page)
        await page.waitForURL(/\/proposal$/)
        await expect(page.getByText('Step 2', { exact: true })).toBeVisible()
    })
})

// Owns the dashboard's delete control, the only exit a Step 1 draft has.
test('Researcher deletes a proposal draft from the dashboard', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('delete-draft')
    await seedDraft(studyTitle)

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        const draftRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(draftRow.getByText('Proposal draft')).toBeVisible()

        await draftRow.getByRole('button', { name: `Delete draft study ${studyTitle}`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Confirm proposal draft deletion?' })
        await dialog.getByRole('button', { name: 'Yes, delete proposal draft' }).click()

        await expect(page.getByText('Proposal draft deleted')).toBeVisible()
        await expect(draftRow).toHaveCount(0)
    })
})

// Owns the researcher's post-submission code record (/view/code) and its guard before the code stage.
test('The code record opens once code is submitted and not before', async ({ browser, studyFeatures }) => {
    const submitted = await seedCodeSubmitted(studyFeatures.uniqueTitle('view-code'))
    const proposalOnly = await seedProposalPendingReview(studyFeatures.uniqueTitle('view-code-early'))

    await withRole(browser, 'researcher', async (page) => {
        await goto(page, `/openstax-lab/study/${submitted.studyId}/view/code`)
        await expect(page.getByRole('heading', { name: 'Submit code', level: 2 })).toBeVisible()
        await expect(page.getByTestId('status-alert')).toContainText('Code submitted to Openstax')
        await expect(page.getByRole('radio', { name: 'analysis.r is the main file', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'View analysis.r', exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: /Previous step/i })).toBeVisible()
        await expect(page.getByRole('link', { name: /Back to my studies/i })).toBeVisible()

        // No code stage yet: the route resolves to no screen, which is the not-found page.
        await page.goto(`/openstax-lab/study/${proposalOnly.studyId}/view/code`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible()
    })
})

// The enclave-side stages between approval and outputs, as both dashboards and the reviewer's
// waiting screen read them. Seeded: the containerizer and the job API write these, not a user.
const STAGES: { stage: SeededJobStage; reviewerPill: string }[] = [
    { stage: 'JOB-PACKAGING', reviewerPill: 'Preparing code' },
    { stage: 'JOB-PROVISIONING', reviewerPill: 'Code queued' },
    { stage: 'JOB-RUNNING', reviewerPill: 'Code running' },
]

test('Dashboards show every enclave run stage', async ({ browser, studyFeatures }) => {
    const seeded = await Promise.all(
        STAGES.map(async ({ stage, reviewerPill }) => {
            const title = studyFeatures.uniqueTitle(stage.toLowerCase())
            return { reviewerPill, title, ...(await seedJobStage(title, stage)) }
        }),
    )

    await withRole(browser, 'reviewer', async (page) => {
        await visitAsRole(page, REVIEWER_DASHBOARD)
        for (const study of seeded) {
            await expect(page.getByRole('row').filter({ hasText: study.title })).toContainText(study.reviewerPill)
        }
        // Opened mid-run, the study holds the reviewer at the outputs step.
        await viewStudyDetails(page, seeded[2].title)
        await expect(page.getByTestId('status-alert')).toContainText('Outputs not ready, code started running')
    })

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        for (const study of seeded) {
            await expect(page.getByRole('row').filter({ hasText: study.title })).toContainText('Code processing')
        }
    })
})

// Owns the unread marker: a study the researcher never opened carries it on its row and in the side
// nav, and opening the study is what clears it (mark-study-opened.tsx, fired on entering the route).
test('Opening a study clears its unread marker', async ({ browser, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('unread')
    await seedProposalPendingReview(studyTitle)

    await withRole(browser, 'researcher', async (page) => {
        await visitAsRole(page, RESEARCHER_DASHBOARD)
        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        // Visually hidden text, so attached rather than visible.
        await expect(studyRow.getByText('Updated', { exact: true })).toBeAttached()
        await expect(page.getByRole('link', { name: /My studies\s*Updated/ })).toBeAttached()

        await clickViewLink(page, studyRow)
        await page.waitForURL(/\/study\//)

        // The write is fired on mount rather than awaited by the page, so re-read the dashboard.
        await expect(async () => {
            await visitAsRole(page, RESEARCHER_DASHBOARD)
            await expect(
                page.getByRole('row').filter({ hasText: studyTitle }).getByText('Updated', { exact: true }),
            ).toHaveCount(0)
        }).toPass()
    })
})
