import { expect, type Locator, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { AI_REVIEW_TIMEOUT, CODEBUILD_SCAN_TIMEOUT, ENCLAVE_RUN_TIMEOUT, POLL_INTERVAL } from './config'

// The stages of a study's life that only a real environment has: the scanner and the AI review
// running in CodeBuild and the job worker, the containerizer, and the enclave itself. Ported from
// qa-review's study-happy-path suite, on the app's own selectors.

export const DEPLOYED_FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'deployed')
export const CODE_SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'code-samples')

export const labSlug = () => process.env.E2E_LAB_SLUG ?? 'openstax-lab'
export const enclaveSlug = () => process.env.E2E_ENCLAVE_SLUG ?? 'openstax'
export const dataPartnerName = () => new RegExp(process.env.E2E_DATA_PARTNER_NAME ?? 'openstax', 'i')

// A published Study Agreement gates every route of the study for each party; a Test Lab's studies
// skip it. Either way, continue.
export async function acknowledgeStudyAgreementIfShown(page: Page) {
    const modal = page.getByRole('dialog').filter({ hasText: 'Study Agreement' })
    if (!(await modal.isVisible())) return
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Continue' }).click()
    await expect(modal).toBeHidden()
}

export async function openCodePage(page: Page, studyId: string) {
    await page.goto(`/${labSlug()}/study/${studyId}/code`, { waitUntil: 'domcontentloaded' })
    await acknowledgeStudyAgreementIfShown(page)
    await expect(page.getByRole('heading', { name: 'Submit code', level: 2 })).toBeVisible()
}

// A path, or a payload uploaded under a name of its own (so no filename can imply the entry point).
export type UploadFile = string | { name: string; mimeType: string; buffer: Buffer }

// Uploads the files and elects `mainFile`; the table may also hold the environment's own
// template, so the star, not a name, is what sets the entry point.
export async function uploadAndElectMain(page: Page, files: UploadFile[], mainFile: string) {
    // One shape for the input: a path is read into a payload under its own name.
    const payloads = files.map((file) =>
        typeof file === 'string'
            ? { name: path.basename(file), mimeType: 'text/plain', buffer: fs.readFileSync(file) }
            : file,
    )
    await page.locator('input[type="file"]').setInputFiles(payloads)
    for (const { name } of payloads) {
        await expect(page.getByRole('button', { name: `View ${name}`, exact: true })).toBeVisible()
    }
    await expect(async () => {
        await page.getByRole('radio', { name: `Set ${mainFile} as main file`, exact: true }).click()
        await expect(page.getByRole('radio', { name: `${mainFile} is the main file`, exact: true })).toBeChecked()
    }).toPass()
}

export async function submitCode(page: Page) {
    const submit = page.getByRole('button', { name: /Submit code/i })
    await expect(submit).toBeEnabled()
    await submit.click()
    await page
        .getByRole('dialog', { name: 'Submit code for review?' })
        .getByRole('button', { name: 'Submit code', exact: true })
        .click()
    await expect(page.getByTestId('status-alert').filter({ hasText: /code submitted/i })).toBeVisible()
}

export async function openReview(page: Page, studyId: string) {
    await page.goto(`/${enclaveSlug()}/study/${studyId}/review`, { waitUntil: 'domcontentloaded' })
    await acknowledgeStudyAgreementIfShown(page)
}

export const scanStatus = (page: Page) => page.getByTestId('security-scan-results').getByRole('status')

// The scanner reports through CodeBuild and the panel polls for it; the pending state going away
// is the signal, within the scan's own budget.
export async function waitForScanVerdict(page: Page, studyId: string, verdict: RegExp) {
    await openReview(page, studyId)
    await expect(scanStatus(page)).not.toContainText(/security scan pending/i, { timeout: CODEBUILD_SCAN_TIMEOUT })
    await expect(scanStatus(page)).toContainText(verdict)
}

export async function expandScanDetails(page: Page): Promise<Locator> {
    const toggle = page.getByTestId('scan-details-toggle')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    }
    return page.getByTestId('scan-details-body')
}

// The review job runs in the job worker (SQS on Dev and Staging, in-process on a PR preview) and
// the panel polls for its report.
export async function waitForAiSummary(page: Page, studyId: string) {
    await openReview(page, studyId)
    const body = page.getByTestId('ai-summary-body')
    await expect(body).toBeVisible({ timeout: AI_REVIEW_TIMEOUT })
    await expect(body).not.toContainText(/did not run|CLAUDE_API_KEY/)
    await expect(page.getByTestId('ai-summary-error')).toHaveCount(0)
}

// The pill on the Data Partner's dashboard for `title`, re-read every POLL_INTERVAL until it says
// `pill`; the dashboard does not poll a decided study on its own.
export async function waitForReviewerPill(page: Page, title: string, pill: string | RegExp, timeout: number) {
    await expect(async () => {
        await page.goto(`/${enclaveSlug()}/dashboard`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('row').filter({ hasText: title })).toContainText(pill)
    }).toPass({ timeout, intervals: [POLL_INTERVAL] })
}

// The real enclave polls /api/studies/ready, runs the job and posts the encrypted outputs. The
// review page re-resolves to the outputs step when they arrive, or to the errored one.
export async function waitForEnclaveOutputs(page: Page, studyId: string) {
    await expect(async () => {
        await openReview(page, studyId)
        const errored = page.getByText(/The code errored/i)
        const keyBox = page.getByRole('textbox', { name: 'Security key' })
        await Promise.race([keyBox.waitFor(), errored.waitFor()]).catch(() => {})
        expect(await errored.isVisible(), `the enclave run of study ${studyId} errored`).toBe(false)
        await expect(keyBox).toBeVisible()
    }).toPass({ timeout: ENCLAVE_RUN_TIMEOUT, intervals: [POLL_INTERVAL] })
}

// Decryption is client-side and does not survive a reload: the key is entered on every visit.
export async function decryptOutputs(page: Page, privateKey: string) {
    const keyBox = page.getByRole('textbox', { name: 'Security key' })
    await expect(keyBox).toBeVisible()
    await keyBox.fill(privateKey)
    // Compared by length, so a failure never prints the key.
    await expect.poll(async () => (await keyBox.inputValue()).length).toBe(privateKey.length)
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(page.getByTestId('outputs-files-section')).toBeVisible()
}

export async function downloadOutput(page: Page, fileName: string) {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `Download ${fileName}`, exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe(fileName)
    const saved = await file.path()
    expect(saved, `download of ${fileName}: ${await file.failure()}`).toBeTruthy()
}
