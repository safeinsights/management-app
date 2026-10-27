import fs from 'fs'
import path from 'path'
import { fillAndSubmitProposal, fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { reviewerApprovesProposal, openCodeReviewEditor, fillCodeCriteria } from '../../flows/review.flows'
import { typeIntoLexical } from '../../flows/lexical'
import { reviewerSharesOutputs } from '../../flows/outputs.flows'
import { CONTAINERIZER_TIMEOUT, ENCLAVE_RUN_TIMEOUT, STAGE_TEST_TIMEOUT } from '../config'
import { expect, forgetStudy, rememberStudy, test } from '../fixtures'
import {
    CODE_SAMPLES,
    DEPLOYED_FIXTURES,
    acknowledgeStudyAgreementIfShown,
    dataPartnerName,
    decryptOutputs,
    downloadOutput,
    enclaveSlug,
    expandScanDetails,
    labSlug,
    openCodePage,
    openReview,
    scanStatus,
    submitCode,
    uploadAndElectMain,
    waitForAiSummary,
    waitForEnclaveOutputs,
    waitForReviewerPill,
    waitForScanVerdict,
} from '../lifecycle'

// One R study through every component a deployment has: the app and its database, the S3 upload,
// the CodeBuild scanner, the job worker's AI review, the containerizer, the real enclave, the
// encrypted outputs and their re-wrapping for the lab. Each stage is its own test so a failure
// names the component; the stages share the study and run in order.
//
// The script is qa-review's known-good single-query main.r (tests/fixtures/deployed/main.r); it
// writes results.csv, which is what the reviewer then opens.

test.describe.configure({ mode: 'serial' })

const MAIN_FILE = 'study-main.r'
const RESULTS_FILE = 'results.csv'
const state = { studyId: '', title: '' }

test('the researcher proposes a study', async ({ roleContext, target }) => {
    state.title = `E2E lifecycle R ${target.name} ${Date.now().toString(36)}`
    const { page } = await roleContext('researcher')
    await page.goto(`/${labSlug()}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(page, state.title, dataPartnerName())
    await confirmStep1(page)
    await page.waitForURL(/\/proposal$/)
    state.studyId = page.url().match(/\/study\/([^/]+)/)![1]
    rememberStudy(state.studyId)
    await fillAndSubmitProposal(page)
})

test('the reviewer approves the proposal', async ({ roleContext }) => {
    const { page } = await roleContext('reviewer')
    await reviewerApprovesProposal(page, state.title)
})

test('the researcher uploads and submits code', async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await openCodePage(page, state.studyId)
    // Uploaded under its own name so nothing but the star can make it the entry point.
    await uploadAndElectMain(
        page,
        [
            {
                name: MAIN_FILE,
                mimeType: 'text/plain',
                buffer: fs.readFileSync(path.join(DEPLOYED_FIXTURES, 'main.r')),
            },
            path.join(CODE_SAMPLES, 'code.r'),
        ],
        MAIN_FILE,
    )
    await submitCode(page)
})

test('the scanner passes the code', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT * 2)
    const { page } = await roleContext('reviewer')
    await waitForScanVerdict(page, state.studyId, /Semgrep: Passed/)
    await expect(scanStatus(page)).toContainText('Semgrep: Passed')
    await expandScanDetails(page)
})

test('the AI review summarises the code', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT * 3)
    const { page } = await roleContext('reviewer')
    await waitForAiSummary(page, state.studyId)
})

test('the reviewer approves the code and the containerizer readies it', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT + CONTAINERIZER_TIMEOUT)
    const { page } = await roleContext('reviewer')
    await openCodeReviewEditor(page, state.title)
    await acknowledgeStudyAgreementIfShown(page)
    await fillCodeCriteria(page, 'yes')
    await page.getByTestId('code-review-decision-approve').click()
    await typeIntoLexical(
        page.getByTestId('code-review-section').locator('[contenteditable="true"]').first(),
        'Approving submitted code for the deployed-environment suite.',
    )
    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Approve code$/i }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('status-alert')).toContainText('Code approved')

    // Packaging, then queued: the containerizer's two webhooks.
    await waitForReviewerPill(page, state.title, /Preparing code|Code queued|Code running/, CONTAINERIZER_TIMEOUT)
})

test('the enclave runs the job', async ({ roleContext, target }) => {
    test.skip(!target.hasEnclave, `${target.name} has no enclave polling it`)
    test.setTimeout(ENCLAVE_RUN_TIMEOUT + STAGE_TEST_TIMEOUT)
    const { page } = await roleContext('reviewer')
    await waitForEnclaveOutputs(page, state.studyId)
})

test("a PR preview takes the enclave's part", async ({ qaApi, target }) => {
    test.skip(target.hasEnclave, 'the real enclave produced the outputs')
    const response = await qaApi.setStudyState(state.studyId, {
        jobStatus: 'RUN-COMPLETE',
        result: { name: RESULTS_FILE, content: 'unique_tasked_count\n42\n' },
    })
    expect(response.status(), await response.text()).toBe(200)
})

test('the reviewer decrypts, downloads and shares the outputs', async ({ accounts, roleContext }) => {
    const key = accounts.reviewer.resultsPrivateKey
    test.skip(!key, 'REVIEWER_RESULTS_PRIVATE_KEY_<ENV> is not set')
    const { page } = await roleContext('reviewer')
    await openReview(page, state.studyId)
    await decryptOutputs(page, key!)
    await expect(page.getByRole('button', { name: RESULTS_FILE, exact: true })).toBeVisible()
    await downloadOutput(page, RESULTS_FILE)
    await reviewerSharesOutputs(page, 'Reviewed on the deployed environment: no sensitive data present.')
    await expect(page.getByText(/outputs and feedback shared/i)).toBeVisible()
})

test('the researcher opens the shared outputs with their own key', async ({ accounts, roleContext }) => {
    const key = accounts.researcher.resultsPrivateKey
    test.skip(!key, 'RESEARCHER_RESULTS_PRIVATE_KEY_<ENV> is not set')
    const { page } = await roleContext('researcher')
    await page.goto(`/${labSlug()}/study/${state.studyId}/view`, { waitUntil: 'domcontentloaded' })
    await acknowledgeStudyAgreementIfShown(page)
    await expect(page.getByText(/Decrypt to view your outputs/i)).toBeVisible()
    await decryptOutputs(page, key!)
    await expect(page.getByRole('button', { name: RESULTS_FILE, exact: true })).toBeVisible()
    await expect(page.getByText(/Outputs and feedback available/i)).toBeVisible()
    await expect(page.getByTestId('security-key-form')).toHaveCount(0)
})

test('the study is deleted', async ({ qaApi }) => {
    const response = await qaApi.deleteStudy(state.studyId)
    expect([200, 404], await response.text()).toContain(response.status())
    forgetStudy(state.studyId)
    expect(enclaveSlug()).toBeTruthy()
})
