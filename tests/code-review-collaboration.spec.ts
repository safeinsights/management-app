import {
    E2E_TIMEOUT,
    E2E_TIMEOUT_LONG,
    expect,
    openContextWithSavedRole,
    test,
    waitForOpenstaxOrgInClerkMetadata,
    type Page,
} from './e2e.helpers'
import { seedCodeSubmitted } from './e2e.seed'

// OTTER-544: two reviewers in the same DO editing live, one submits, the other is
// kicked out. The only behaviour that requires real WebSocket + Hocuspocus + Yjs +
// Lexical + action + redirect, across two browser contexts. Unit tests already cover
// auth, action enforcement, payload shape, Y.Map peer sync via mocked Hocuspocus,
// post-feedback rendering, and the reconnect-poll predicate; this spec deliberately
// does not duplicate any of that.
//
// The CODE-SUBMITTED precondition is seeded directly (no UI propose/approve/upload),
// so the test opens straight into the two-context collaboration. Both contexts
// restore the same reviewer session from storageState; each provider still generates
// its own tabSessionId (random UUID), so the submission-listener's own-tab-skip fires
// correctly across the two contexts.

// Realistic narrative feedback used to exercise the editor end-to-end.
const FEEDBACK_TEXT =
    'After reviewing the submitted code I have concerns about how the proposal alignment is handled and whether the agreements are fully respected. The security checks pass but the privacy protections need more attention before this can move forward. I am sharing this feedback so the team can iterate before resubmission and make sure the analysis matches the approved research questions and dataset usage outlined in the proposal.'

const CRITERIA_KEYS = ['proposalAlignment', 'agreementCompliance', 'securityChecks', 'privacyProtection'] as const

const feedbackEditorIn = (page: Page) =>
    page.getByTestId('code-review-section').locator('[contenteditable="true"]').first()

// Hocuspocus auth + Y.Doc sync can take 10-20s in dev with two concurrent contexts;
// the inner contenteditable only appears once the editor reaches 'connected'.
async function waitForFeedbackEditorReady(page: Page): Promise<void> {
    await expect(feedbackEditorIn(page)).toBeVisible({ timeout: E2E_TIMEOUT_LONG })
}

const criterionRadioIn = (page: Page, key: string, value: 'yes' | 'no' | 'not-sure') =>
    page.locator(`input[name="criteria-${key}"][value="${value}"]`)

async function fillAllCriteriaYes(page: Page): Promise<void> {
    for (const key of CRITERIA_KEYS) {
        await criterionRadioIn(page, key, 'yes').check()
    }
}

test('a reviewer in two tabs collaborates live; one tab submits, the other is redirected with the submission toast', async ({
    browser,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('two-tabs-collab')
    const { studyId } = await seedCodeSubmitted(studyTitle)

    // ctxA enters via the per-study agreements flow ("Proceed to Step 3" -> bare
    // /review). ctxB navigates directly to /review; the reviewer state machine
    // resolves the code-review screen from the projected study state.
    let ctxA: Awaited<ReturnType<typeof openContextWithSavedRole>> | undefined
    let ctxB: Awaited<ReturnType<typeof openContextWithSavedRole>> | undefined

    try {
        await test.step('reviewer ctxA opens the code-review page via agreements', async () => {
            ctxA = await openContextWithSavedRole(browser, 'reviewer')
            await ctxA.page.goto(`/openstax/study/${studyId}/agreements`)
            await ctxA.page.waitForURL(/\/agreements(\?.*)?$/)
            await waitForOpenstaxOrgInClerkMetadata(ctxA.page)
            await ctxA.page.getByRole('button', { name: /Proceed to Step 3/i }).click()
            await ctxA.page.waitForURL(/\/review(\?.*)?$/)
            await expect(ctxA.page.getByTestId('code-review-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('reviewer ctxB opens the code-review page directly', async () => {
            ctxB = await openContextWithSavedRole(browser, 'reviewer')
            await ctxB.page.goto(`/openstax/study/${studyId}/review`)
            await waitForOpenstaxOrgInClerkMetadata(ctxB.page)
            await expect(ctxB.page.getByTestId('code-review-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('feedback typed in ctxA syncs to ctxB in real time', async () => {
            await waitForFeedbackEditorReady(ctxA!.page)
            await waitForFeedbackEditorReady(ctxB!.page)

            const editorA = feedbackEditorIn(ctxA!.page)
            await editorA.click()
            await ctxA!.page.keyboard.type(FEEDBACK_TEXT)
            await expect(feedbackEditorIn(ctxB!.page)).toContainText(FEEDBACK_TEXT.slice(0, 60), {
                timeout: E2E_TIMEOUT,
            })
        })

        await test.step('ctxA selects Yes on Proposal alignment; ctxB sees the selection', async () => {
            // Sanity: both contexts still in collab view (not legacy/redirect).
            await expect(ctxA!.page.getByTestId('code-evaluation-section')).toBeVisible()
            await expect(ctxB!.page.getByTestId('code-evaluation-section')).toBeVisible()

            const radioYesA = criterionRadioIn(ctxA!.page, 'proposalAlignment', 'yes')
            await radioYesA.check()
            await expect(radioYesA).toBeChecked()

            const radioYesB = criterionRadioIn(ctxB!.page, 'proposalAlignment', 'yes')
            await expect(radioYesB).toBeChecked({ timeout: E2E_TIMEOUT })
        })

        await test.step('ctxA completes criteria + decision, submits; ctxB is redirected with the submission toast', async () => {
            await fillAllCriteriaYes(ctxA!.page)
            await ctxA!.page.getByTestId('code-review-decision-approve').click()
            await ctxA!.page.getByTestId('code-review-submit').click()
            await ctxA!.page.getByRole('button', { name: /Yes, submit review/i }).click()

            // After a decision both contexts land on bare /review, which the reviewer
            // state machine resolves to the code post-feedback screen. The toast title is
            // unit-tested (use-submission-redirect-listener.test.ts); here we assert ctxB
            // was kicked out of the editor and re-rendered the post-feedback view, the
            // functional behaviour the AC requires.
            for (const ctx of [ctxA!, ctxB!]) {
                await expect(ctx.page.getByRole('heading', { name: /Review study code/i })).toBeVisible()
                await expect(ctx.page.getByText(/Approved on/i)).toBeVisible()
            }
        })
    } finally {
        await ctxA?.context.close()
        await ctxB?.context.close()
    }
})
