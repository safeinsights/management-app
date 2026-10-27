import { fillAndSubmitProposal, fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { reviewerApprovesProposal } from '../../flows/review.flows'
import { CODER_LAUNCH_TIMEOUT, STAGE_TEST_TIMEOUT } from '../config'
import { currentCode, type Account } from '../env'
import { expect, forgetStudy, rememberStudy, test, type Page } from '../fixtures'
import { dataPartnerName, labSlug, openCodePage } from '../lifecycle'

// Coder: the app provisions a workspace for the study, Coder's OIDC sends the researcher through
// Clerk's hosted sign-in, code-server renders, and the app's code page lists the workspace's
// files (the EFS volume mounted into the Lambda). E2E_CODER=0 leaves this out.

test.describe.configure({ mode: 'serial' })

const state = { studyId: '', title: '' }

// Clerk's hosted sign-in (accounts.dev) is a staged form, unlike the app's embedded one. A warm
// Coder session skips it, so every step is conditional on the page it finds.
async function signInToCoder(ide: Page, account: Account) {
    const workbench = ide.locator('.monaco-workbench').first()
    const emailField = ide.getByLabel(/Email address/i).first()
    await expect(workbench.or(emailField)).toBeVisible()
    if (await workbench.isVisible()) return
    await emailField.fill(account.email)
    await ide.getByRole('button', { name: /^Continue$/ }).click()
    await ide.getByLabel(/^Password$/i).fill(account.password)
    await ide.getByRole('button', { name: /^Continue$/ }).click()
    const otp = ide.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]')
    await expect(otp.first()).toBeVisible()
    const code = currentCode(account.secondFactor)
    if ((await otp.count()) > 1) {
        for (let i = 0; i < code.length; i++) await otp.nth(i).fill(code[i])
    } else {
        await otp.first().fill(code)
    }
    // Clerk submits a complete code on its own; a submit button is there on some versions only.
    const submit = ide.getByRole('button', { name: /^(Continue|Verify)/ }).first()
    if (await submit.isVisible()) await submit.click().catch(() => {})
}

test.beforeEach(() => {
    test.skip(process.env.E2E_CODER === '0', 'E2E_CODER=0')
})

test('an approved study is ready for its IDE', async ({ roleContext, target }) => {
    state.title = `E2E coder ${target.name} ${Date.now().toString(36)}`
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

test('the IDE launches, signs in and renders the workspace', async ({ accounts, roleContext }) => {
    test.setTimeout(CODER_LAUNCH_TIMEOUT + STAGE_TEST_TIMEOUT)
    const { page } = await roleContext('researcher')
    await openCodePage(page, state.studyId)
    const launch = page.getByRole('button', { name: 'Launch IDE' }).first()
    await expect(launch).toBeEnabled()
    // The app opens the workspace with window.open once Coder reports it ready; kept in this tab
    // so the OIDC hops that follow can be driven.
    await page.evaluate(() => {
        window.open = (url?: string | URL) => {
            if (url) window.location.assign(String(url))
            return window
        }
    })
    await launch.click()

    // A cold workspace is built first, which takes minutes; Coder's OIDC then asks to continue.
    const continueControl = page
        .getByRole('link', { name: /Continue to launch IDE/i })
        .or(page.getByRole('button', { name: /Continue to launch IDE/i }))
        .first()
    const workbench = page.locator('.monaco-workbench').first()
    const signIn = page.getByLabel(/Email address/i).first()
    await expect(continueControl.or(workbench).or(signIn).first()).toBeVisible({ timeout: CODER_LAUNCH_TIMEOUT })
    if (await continueControl.isVisible()) await continueControl.click()
    await signInToCoder(page, accounts.researcher)
    await expect(workbench).toBeVisible({ timeout: CODER_LAUNCH_TIMEOUT })
    // The workspace was seeded from the code environment's starter: its entry point is in the Explorer.
    await expect(page.getByRole('treeitem', { name: /^main\.(r|py)$/i }).first()).toBeVisible()
})

test('the app lists the workspace files', async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await openCodePage(page, state.studyId)
    await expect(page.getByRole('button', { name: /^View main\.(r|py)$/i }).first()).toBeVisible()
})

test('the coder study is deleted', async ({ qaApi }) => {
    const response = await qaApi.deleteStudy(state.studyId)
    expect([200, 404], await response.text()).toContain(response.status())
    forgetStudy(state.studyId)
})
