import {
    E2E_TIMEOUT,
    E2E_TIMEOUT_LONG,
    expect,
    openContextWithSavedRole,
    test,
    waitForOpenstaxOrgInClerkMetadata,
    type Page,
} from './e2e.helpers'
import { seedProposalPendingReview } from './e2e.seed'

// OTTER-471: two reviewers in the same DO open the proposal-review page in separate
// tabs/contexts. One submits a decision; the other is kicked out via the stateless
// broadcast and lands on the post-feedback view. Mirrors code-review-collaboration
// but on the proposal-review path (no code upload, lighter seed). Unit tests already
// cover the broadcast payload, listener parsing, and reconnect predicate; this spec
// verifies the real WebSocket + Hocuspocus + Yjs + Lexical + action + redirect chain
// across two browser contexts.
//
// The PENDING-REVIEW proposal is seeded directly; both contexts restore the same
// reviewer session from storageState.

// 60+ words to satisfy FEEDBACK_MIN_WORDS=50.
const FEEDBACK_TEXT =
    'Thanks for submitting this proposal. The research questions are clear and the dataset request looks reasonable given the scope you have described. We have a few clarifications before moving forward — specifically around how you plan to handle missing demographic data and whether the impact statement can be expanded with concrete examples. Once those are addressed we expect to be able to proceed with the next steps. We look forward to your reply and supporting this work.'

const feedbackEditorIn = (page: Page) =>
    page.getByTestId('review-feedback-section').locator('[contenteditable="true"]').first()

async function waitForFeedbackEditorReady(page: Page): Promise<void> {
    await expect(feedbackEditorIn(page)).toBeVisible({ timeout: E2E_TIMEOUT_LONG })
}

test('a reviewer in two tabs collaborates live on a proposal review; one tab submits, the other is redirected', async ({
    browser,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('proposal-review-two-tabs')
    const { studyId } = await seedProposalPendingReview(studyTitle)

    let ctxA: Awaited<ReturnType<typeof openContextWithSavedRole>> | undefined
    let ctxB: Awaited<ReturnType<typeof openContextWithSavedRole>> | undefined

    try {
        await test.step('reviewer ctxA opens the proposal-review page', async () => {
            ctxA = await openContextWithSavedRole(browser, 'reviewer')
            await ctxA.page.goto(`/openstax/study/${studyId}/review`)
            await waitForOpenstaxOrgInClerkMetadata(ctxA.page)
            await expect(ctxA.page.getByTestId('review-feedback-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('reviewer ctxB opens the same proposal-review page in a separate context', async () => {
            ctxB = await openContextWithSavedRole(browser, 'reviewer')
            await ctxB.page.goto(`/openstax/study/${studyId}/review`)
            await waitForOpenstaxOrgInClerkMetadata(ctxB.page)
            await expect(ctxB.page.getByTestId('review-feedback-section')).toBeVisible({ timeout: E2E_TIMEOUT })
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

        await test.step('ctxA selects approve and submits; ctxB is redirected away from the editable view', async () => {
            await ctxA!.page.getByRole('radio', { name: /^Approve$/i }).check()
            await ctxA!.page.getByRole('button', { name: /Submit review/i }).click()
            await ctxA!.page.getByRole('button', { name: /Yes, submit review/i }).click()

            await ctxA!.page.waitForURL(new RegExp(`/study/${studyId}/review`))
            await expect(ctxA!.page.getByTestId('review-feedback-section')).toBeHidden({ timeout: E2E_TIMEOUT })

            // ctxB receives the stateless broadcast and routes away from the editable
            // surface. The toast text is unit-tested (use-submission-redirect-listener
            // .test.ts); here we assert ctxB no longer renders the editable feedback
            // section — the AC-required behaviour (no further edits possible).
            await expect(ctxB!.page.getByTestId('review-feedback-section')).toBeHidden({ timeout: E2E_TIMEOUT })
        })
    } finally {
        await ctxA?.context.close()
        await ctxB?.context.close()
    }
})
