import path from 'path'
import { fillAndSubmitProposal, fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { reviewerApprovesProposal } from '../../flows/review.flows'
import { STAGE_TEST_TIMEOUT } from '../config'
import { expect, forgetStudy, rememberStudy, test } from '../fixtures'
import {
    DEPLOYED_FIXTURES,
    dataPartnerName,
    expandScanDetails,
    labSlug,
    openCodePage,
    submitCode,
    uploadAndElectMain,
    waitForScanVerdict,
} from '../lifecycle'

// The scanner's other verdict, on a study of its own so the lifecycle's happy path never waits
// on it: deliberately insecure R and Python files (never run) whose fake, format-shaped
// credentials Semgrep's secret rules match.

test.describe.configure({ mode: 'serial' })

const VULNERABLE_FILES = ['vulnerable.r', 'vulnerable.py']
const state = { studyId: '', title: '' }

test('a study with insecure code is proposed and approved', async ({ roleContext, target }) => {
    state.title = `E2E scan findings ${target.name} ${Date.now().toString(36)}`
    const researcher = await roleContext('researcher')
    await researcher.page.goto(`/${labSlug()}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(researcher.page, state.title, dataPartnerName())
    await confirmStep1(researcher.page)
    await researcher.page.waitForURL(/\/proposal$/)
    state.studyId = researcher.page.url().match(/\/study\/([^/]+)/)![1]
    rememberStudy(state.studyId)
    await fillAndSubmitProposal(researcher.page)

    const reviewer = await roleContext('reviewer')
    await reviewerApprovesProposal(reviewer.page, state.title)
})

test('the insecure files are submitted', async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await openCodePage(page, state.studyId)
    await uploadAndElectMain(
        page,
        [path.join(DEPLOYED_FIXTURES, 'main.r'), ...VULNERABLE_FILES.map((file) => path.join(DEPLOYED_FIXTURES, file))],
        'main.r',
    )
    await submitCode(page)
})

test('the scanner fails the code and names the findings', async ({ roleContext }) => {
    test.setTimeout(STAGE_TEST_TIMEOUT * 2)
    const { page } = await roleContext('reviewer')
    await waitForScanVerdict(page, state.studyId, /Semgrep: Failed/)
    const details = await expandScanDetails(page)
    for (const file of VULNERABLE_FILES) await expect(details).toContainText(file)
})

test('the insecure study is deleted', async ({ qaApi }) => {
    const response = await qaApi.deleteStudy(state.studyId)
    expect([200, 404], await response.text()).toContain(response.status())
    forgetStudy(state.studyId)
})
