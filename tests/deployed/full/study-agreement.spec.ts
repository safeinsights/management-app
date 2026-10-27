import { fillAndSubmitProposal, fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { reviewerApprovesProposal } from '../../flows/review.flows'
import { expect, forgetStudy, rememberStudy, test, type Page } from '../fixtures'
import { enclaveSlug } from '../lifecycle'

// The per-study Study Agreement: a lab that is not a designated Test Lab proposes, the SI admin
// publishes the signed agreement from the legal page, and each party meets the gate on their
// next visit. E2E_SLA_LAB_SLUG / E2E_SLA_LAB_NAME name that lab; on Dev it is `agreements`
// ("Agreements Lab"), which the shared researcher belongs to. Elsewhere the spec skips until set.

test.describe.configure({ mode: 'serial' })

const slaLabSlug = () => process.env.E2E_SLA_LAB_SLUG ?? 'agreements'
const slaLabName = () => process.env.E2E_SLA_LAB_NAME ?? 'Agreements Lab'
const dataPartnerLabel = () => process.env.E2E_DATA_PARTNER_NAME ?? 'Openstax'
const state = { studyId: '', title: '' }

// A one-page PDF built in memory, so no binary fixture is needed.
function minimalPdf(text: string): Buffer {
    const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((object, index) => {
        offsets.push(out.length)
        out += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out)
}

async function acknowledgeStudyAgreement(page: Page) {
    const modal = page.getByRole('dialog').filter({ hasText: 'Study Agreement' })
    await expect(modal).toBeVisible()
    const proceed = modal.getByRole('button', { name: 'Continue' })
    await expect(proceed).toBeDisabled()
    await modal.getByRole('checkbox').check()
    await proceed.click()
    await expect(modal).toBeHidden()
}

test.beforeEach(({ target }) => {
    test.skip(
        !process.env.E2E_SLA_LAB_SLUG && target.accountsEnv !== 'qa',
        'E2E_SLA_LAB_SLUG names a lab on this environment that is not a Test Lab',
    )
})

test('a study from a non-test lab is proposed and approved', async ({ roleContext, target }) => {
    state.title = `E2E agreement ${target.name} ${Date.now().toString(36)}`
    const researcher = await roleContext('researcher')
    await researcher.page.goto(`/${slaLabSlug()}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(researcher.page, state.title, new RegExp(dataPartnerLabel(), 'i'))
    await confirmStep1(researcher.page)
    await researcher.page.waitForURL(/\/proposal$/)
    state.studyId = researcher.page.url().match(/\/study\/([^/]+)/)![1]
    rememberStudy(state.studyId)
    await fillAndSubmitProposal(researcher.page)

    const reviewer = await roleContext('reviewer')
    await reviewerApprovesProposal(reviewer.page, state.title)
    await reviewer.page.goto(`/${enclaveSlug()}/study/${state.studyId}/review`, { waitUntil: 'domcontentloaded' })
    await expect(reviewer.page.getByText(/Study agreements are being prepared/i)).toBeVisible()
})

test('the SI admin publishes the signed agreement', async ({ roleContext }) => {
    const { page } = await roleContext('admin')
    await page.goto('/admin/safeinsights/legal', { waitUntil: 'domcontentloaded' })
    const upload = page.getByRole('dialog', { name: 'Upload a signed study agreement' })
    await expect(async () => {
        await page.getByRole('tab', { name: 'Study Agreements' }).click()
        await page.getByRole('button', { name: 'Upload signed study agreement' }).click()
        await expect(upload).toBeVisible()
    }).toPass()
    // Three chained selects: each one unlocks the next.
    for (const [label, option] of [
        ['Data Partner', dataPartnerLabel()],
        ['Research Lab', slaLabName()],
        ['Study', state.title],
    ] as const) {
        await upload.getByRole('textbox', { name: label, exact: true }).click()
        await page.getByRole('option', { name: option, exact: true }).click()
    }
    await upload.getByLabel('Signed on').fill(new Date().toISOString().slice(0, 10))
    await upload.locator('input[type="file"]').setInputFiles({
        name: 'study-agreement.pdf',
        mimeType: 'application/pdf',
        buffer: minimalPdf(`E2E study agreement ${state.title}`),
    })
    await upload.getByRole('button', { name: 'Publish', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Publish this file?' })
    await expect(confirm).toContainText(state.title)
    await confirm.getByRole('button', { name: 'Yes, publish' }).click()
    await expect(upload).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: state.title })
    await expect(row.getByRole('link', { name: 'View PDF' })).toBeVisible()
})

test('each party acknowledges the agreement on their next visit', async ({ roleContext }) => {
    const researcher = await roleContext('researcher')
    await researcher.page.goto(`/${slaLabSlug()}/study/${state.studyId}/code`, { waitUntil: 'domcontentloaded' })
    await acknowledgeStudyAgreement(researcher.page)
    await expect(researcher.page.getByRole('heading', { name: 'Submit code', level: 2 })).toBeVisible()

    const reviewer = await roleContext('reviewer')
    await reviewer.page.goto(`/${enclaveSlug()}/study/${state.studyId}/review`, { waitUntil: 'domcontentloaded' })
    await acknowledgeStudyAgreement(reviewer.page)
    await expect(reviewer.page.getByText(/Study agreements are being prepared/i)).toHaveCount(0)
})

test('the agreement study is deleted', async ({ qaApi }) => {
    const response = await qaApi.deleteStudy(state.studyId)
    expect([200, 404], await response.text()).toContain(response.status())
    forgetStudy(state.studyId)
})
