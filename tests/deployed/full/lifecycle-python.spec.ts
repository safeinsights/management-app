import path from 'path'
import { fillAndSubmitProposal, fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { reviewerApprovesProposal, openCodeReviewEditor, fillCodeCriteria } from '../../flows/review.flows'
import { typeIntoLexical } from '../../flows/lexical'
import { CONTAINERIZER_TIMEOUT, STAGE_TEST_TIMEOUT } from '../config'
import { expect, forgetStudy, rememberStudy, test } from '../fixtures'
import {
    CODE_SAMPLES,
    acknowledgeStudyAgreementIfShown,
    dataPartnerName,
    labSlug,
    openCodePage,
    submitCode,
    uploadAndElectMain,
    waitForAiSummary,
    waitForReviewerPill,
    waitForScanVerdict,
} from '../lifecycle'

// The Python code environment through the scanner, the AI review and the containerizer. It stops
// once the image is queued: there is no known-good Python script for the enclave's data access yet,
// so a run would only prove an error path.

test.describe.configure({ mode: 'serial' })

const state = { studyId: '', title: '' }

test('the researcher proposes a Python study', async ({ roleContext, target }) => {
    state.title = `E2E lifecycle Python ${target.name} ${Date.now().toString(36)}`
    const { page } = await roleContext('researcher')
    await page.goto(`/${labSlug()}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(page, state.title, dataPartnerName(), 'Python')
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

test('the researcher uploads and submits Python code', async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await openCodePage(page, state.studyId)
    await uploadAndElectMain(page, [path.join(CODE_SAMPLES, 'analysis.py')], 'analysis.py')
    await submitCode(page)
})

test('the scanner and the AI review handle Python', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT * 3)
    const { page } = await roleContext('reviewer')
    await waitForScanVerdict(page, state.studyId, /Semgrep: (Passed|Failed)/)
    await waitForAiSummary(page, state.studyId)
})

test('the containerizer readies the Python image', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT + CONTAINERIZER_TIMEOUT)
    const { page } = await roleContext('reviewer')
    await openCodeReviewEditor(page, state.title)
    await acknowledgeStudyAgreementIfShown(page)
    await fillCodeCriteria(page, 'yes')
    await page.getByTestId('code-review-decision-approve').click()
    await typeIntoLexical(
        page.getByTestId('code-review-section').locator('[contenteditable="true"]').first(),
        'Approving Python code for the deployed-environment suite.',
    )
    await page.getByTestId('code-review-submit').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Approve code$/i }).click()
    await expect(dialog).toBeHidden()
    await waitForReviewerPill(page, state.title, /Preparing code|Code queued|Code running/, CONTAINERIZER_TIMEOUT)
})

test('the Python study is deleted', async ({ qaApi }) => {
    const response = await qaApi.deleteStudy(state.studyId)
    expect([200, 404], await response.text()).toContain(response.status())
    forgetStudy(state.studyId)
})
