import type { Locator } from '@playwright/test'
import { authFileFor, expect, goto, test, TestingUsers, withRole, type Page } from './e2e.helpers'
import { seedApprovedAwaitingStudyAgreement, seedClearUnpublishedLegalDrafts, seedOrg } from './e2e.seed'
import { openStudy } from './flows/dashboard.flows'

// The SI admin's legal page: the global documents (drafted but never published here, since a
// published Terms of Service blocks every user of the database until they acknowledge it), the
// per-org participation agreements (published only for orgs seeded with no members), and the
// per-study Study Agreement.

test.use({ storageState: authFileFor('admin') })

const SIGNED_ON = '2026-01-15'
const SIGNED_ON_SHOWN = 'Jan 15, 2026'

test('SI admin saves a Terms of Service draft without publishing it', { tag: '@admin' }, async ({ page }) => {
    // The draft this test saves would otherwise greet the next run on the review step.
    await seedClearUnpublishedLegalDrafts('TOS')
    await goto(page, '/admin/safeinsights/legal')
    await expect(page.getByRole('heading', { name: 'SafeInsights Legal', level: 1 })).toBeVisible()
    await page.getByRole('tab', { name: 'Terms of Service' }).click()
    const panel = page.getByRole('tabpanel')
    await expect(panel.getByText(/Published on/)).toBeVisible()

    await panel.getByRole('button', { name: 'Upload', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Terms of Service' })
    await expect(dialog.getByText('Upload your draft document here:')).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles('tests/assets/tos-draft.md')
    await expect(dialog.getByText('Uploaded:')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save Draft' }).click()

    // The review step renders the saved draft; stepping back shows it is what is now saved.
    await expect(dialog.getByText('Review your saved draft:')).toBeVisible()
    await expect(dialog.getByText('Draft version uploaded by the end-to-end suite.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect(dialog.getByText('Current saved draft:')).toBeVisible()
    await expect(dialog.getByText('tos-draft.md')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    // Reopening resumes on the review step, with the published version untouched.
    await panel.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(dialog.getByText('Review your saved draft:')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
    await expect(panel.getByText(/Published on/)).toBeVisible()

    await panel.getByRole('button', { name: 'Version History' }).click()
    const history = page.getByRole('dialog', { name: 'Terms of Service — version history' })
    await expect(history.getByRole('cell', { name: '1', exact: true })).toBeVisible()
    await expect(history.getByRole('cell', { name: '2', exact: true })).toBeVisible()
    await history.getByRole('button', { name: 'Close' }).click()
    await expect(history).toBeHidden()

    // The admin acknowledged version 2 in global setup; other rows belong to other specs. The table
    // pages at 25 and every user of the database is in it, so the row is wherever it is.
    await expect(panel.getByRole('heading', { name: 'Terms of Service acknowledgements' })).toBeVisible()
    const adminRow = await findRowAcrossPages(panel, TestingUsers.admin.identifier)
    await expect(adminRow.getByRole('cell', { name: '2', exact: true })).toBeVisible()
})

// Walks a paginated datatable until a row with `text` is on the page; fails on the last page.
async function findRowAcrossPages(table: Locator, text: string) {
    const row = table.getByRole('row').filter({ hasText: text })
    const nextPage = table.getByRole('button', { name: 'Next page' })
    await expect(async () => {
        if ((await row.count()) > 0) return
        expect(await nextPage.isEnabled(), `no row containing "${text}" on any page`).toBe(true)
        await nextPage.click()
        throw new Error(`row containing "${text}" is not on this page yet`)
    }).toPass()
    return row
}

async function publishParticipationAgreement(
    page: Page,
    { tab, signatory, orgName, dialogTitle }: { tab: string; signatory: string; orgName: string; dialogTitle: string },
) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('tabpanel').getByRole('button', { name: 'Upload', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: dialogTitle })
    // A searchable Select: typing narrows the options to the one org.
    await dialog.getByRole('textbox', { name: signatory }).fill(orgName)
    await page.getByRole('option', { name: orgName, exact: true }).click()
    await dialog.getByLabel('Signed on').fill(SIGNED_ON)
    await dialog.locator('input[type="file"]').setInputFiles('tests/assets/empty.pdf')
    await expect(dialog.getByText('empty.pdf')).toBeVisible()
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

    const confirm = page.getByRole('dialog', { name: 'Publish this file?' })
    await expect(confirm).toContainText(orgName)
    await confirm.getByRole('button', { name: 'Yes, publish' }).click()
    await expect(confirm).toBeHidden()
    await expect(dialog).toBeHidden()

    const row = page.getByRole('row').filter({ hasText: orgName })
    await expect(row).toContainText(SIGNED_ON_SHOWN)
    await expect(row.getByRole('link', { name: 'View PDF' })).toBeVisible()
}

test('SI admin publishes participation agreements for new organizations', { tag: '@admin' }, async ({ page }) => {
    // Orgs with no members: a published DOPA/ROPA blocks every member until acknowledged.
    const enclave = await seedOrg({ type: 'enclave' })
    const lab = await seedOrg({ type: 'lab' })

    await goto(page, '/admin/safeinsights/legal')
    await publishParticipationAgreement(page, {
        tab: 'DOPA',
        signatory: 'Data Partner',
        orgName: enclave.name,
        dialogTitle: 'Upload a signed Data Organization Participation Agreement',
    })
    await publishParticipationAgreement(page, {
        tab: 'ROPA',
        signatory: 'Research Lab',
        orgName: lab.name,
        dialogTitle: 'Upload a signed Research Organization Participation Agreement',
    })

    // The org's own legal center now carries it.
    await goto(page, `/${enclave.slug}/admin/legal`)
    await page.getByRole('tab', { name: 'Data Organization Participation Agreement' }).click()
    await expect(page.getByText(`Effective on: ${SIGNED_ON_SHOWN}`)).toBeVisible()
    await expect(page.getByRole('tabpanel').getByRole('link', { name: 'PDF' })).toBeVisible()
})

test(
    'SI admin publishes a Study Agreement and the researcher meets it',
    { tag: '@admin' },
    async ({ browser, page, studyFeatures }) => {
        const studyTitle = studyFeatures.uniqueTitle('sla-publish')
        await seedApprovedAwaitingStudyAgreement(studyTitle)

        await goto(page, '/admin/safeinsights/legal')
        await page.getByRole('tab', { name: 'Study Agreements' }).click()
        await page.getByRole('button', { name: 'Upload signed study agreement' }).click()
        const dialog = page.getByRole('dialog', { name: 'Upload a signed study agreement' })
        // Three chained selects: each one unlocks the next.
        await dialog.getByRole('textbox', { name: 'Data Partner' }).click()
        await page.getByRole('option', { name: 'Openstax', exact: true }).click()
        await dialog.getByRole('textbox', { name: 'Research Lab' }).click()
        await page.getByRole('option', { name: 'Openstax Lab', exact: true }).click()
        await dialog.getByRole('textbox', { name: 'Study', exact: true }).click()
        await page.getByRole('option', { name: studyTitle, exact: true }).click()
        await dialog.getByLabel('Signed on').fill(SIGNED_ON)
        await dialog.locator('input[type="file"]').setInputFiles('tests/assets/empty.pdf')
        await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

        const confirm = page.getByRole('dialog', { name: 'Publish this file?' })
        await expect(confirm).toContainText(studyTitle)
        await confirm.getByRole('button', { name: 'Yes, publish' }).click()
        await expect(dialog).toBeHidden()
        const row = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(row).toContainText(SIGNED_ON_SHOWN)
        await expect(row.getByRole('link', { name: 'View PDF' })).toBeVisible()

        // Published, the agreement gates the parties' next visit (acknowledging is study-agreement.spec's).
        await withRole(browser, 'researcher', async (researcherPage) => {
            await openStudy(researcherPage, studyTitle)
            const modal = researcherPage.getByRole('dialog').filter({ hasText: 'Study Agreement' })
            await expect(modal).toBeVisible()
            await expect(modal.getByRole('button', { name: 'Continue' })).toBeDisabled()
        })
    },
)
