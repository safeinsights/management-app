import {
    E2E_TIMEOUT,
    E2E_TIMEOUT_LONG,
    expect,
    fillLexicalField,
    openContextAsRole,
    test,
    visitClerkProtectedPage,
    type Page,
} from './e2e.helpers'

// OTTER-471: two reviewers in the same DO open the proposal-review page in
// separate tabs/contexts. One submits a decision; the other is kicked out via
// the stateless broadcast, lands on the post-feedback view. Mirrors
// tests/code-review-collaboration.spec.ts but exercises the proposal-review
// path (no code upload step, lighter seed). Unit tests already cover the
// broadcast payload, listener parsing, and reconnect predicate; this spec
// verifies the real WebSocket + Hocuspocus + Yjs + Lexical + action +
// redirect chain across two browser contexts.

// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 120_000)
})

// 60+ words to satisfy FEEDBACK_MIN_WORDS=50.
const FEEDBACK_TEXT =
    'Thanks for submitting this proposal. The research questions are clear and the dataset request looks reasonable given the scope you have described. We have a few clarifications before moving forward — specifically around how you plan to handle missing demographic data and whether the impact statement can be expanded with concrete examples. Once those are addressed we expect to be able to proceed with the next steps. We look forward to your reply and supporting this work.'

async function createProposalAsResearcher(page: Page, studyTitle: string): Promise<string> {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    await page.getByTestId('new-study').first().click()

    await expect(page.getByText(/^STEP 1A$/i)).toBeVisible()
    const orgSelect = page.getByTestId('org-select')
    await orgSelect.waitFor({ state: 'visible' })
    await page.waitForTimeout(1000)
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: /openstax/i }).click()
    const langR = page.getByRole('radio', { name: 'R', exact: true })
    await langR.waitFor({ state: 'visible' })
    await langR.click()

    await page.getByRole('button', { name: /Proceed to Step 2/i }).click()
    await page.waitForURL(/\/proposal$/)

    const studyId = page.url().match(/\/study\/([^/]+)/)![1]

    await page.getByLabel('Study Title').fill(studyTitle)
    await page.getByPlaceholder('Select dataset(s) of interest').click()
    await page.getByRole('option').first().click()
    await fillLexicalField(page, 'Research question(s)', 'What is the effect of multi-tab review on outcomes?')
    await fillLexicalField(page, 'Project summary', 'Examine how concurrent reviews stay consistent.')
    await fillLexicalField(page, 'Impact', 'Reduce reviewer conflicts and improve throughput.')
    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    await page.getByRole('option').first().click()

    await page.getByRole('button', { name: /Submit initial request/i }).click()
    await page.getByRole('button', { name: /Yes, submit initial request/i }).click()
    await expect(page.getByText(/submitted successfully/i)).toBeVisible()
    await page.getByRole('link', { name: /Go to dashboard/i }).click()
    await page.waitForURL('**/dashboard')

    return studyId
}

// Spy mode toggles the OpenStax feature flags (incl. the proposal-review
// collaboration flag); each fresh context needs it enabled once. Forced click
// because the `.pi-symbol` has opacity:0 but pointer-events:auto.
async function enableSpyMode(page: Page): Promise<void> {
    await page.locator('.pi-symbol').click({ force: true })
    await expect(page.locator('body.spy-mode')).toBeAttached()
}

// useProposalCollaborationFeatureFlag depends on the Clerk session's `orgs`
// metadata; wait until openstax appears so the flag can flip true.
async function waitForOpenstaxOrgInClerkMetadata(page: Page): Promise<void> {
    await page.waitForFunction(
        () => {
            const w = window as unknown as {
                Clerk?: {
                    user?: { publicMetadata?: { orgs?: Record<string, unknown>; teams?: Record<string, unknown> } }
                }
            }
            const orgs = w.Clerk?.user?.publicMetadata?.orgs ?? w.Clerk?.user?.publicMetadata?.teams ?? {}
            const keys = Object.keys(orgs)
            return keys.includes('openstax') || keys.includes('openstax-lab')
        },
        undefined,
        { timeout: E2E_TIMEOUT_LONG },
    )
}

const feedbackEditorIn = (page: Page) =>
    page.getByTestId('review-feedback-section').locator('[contenteditable="true"]').first()

async function waitForFeedbackEditorReady(page: Page): Promise<void> {
    await expect(feedbackEditorIn(page)).toBeVisible({ timeout: E2E_TIMEOUT_LONG })
}

test('a reviewer in two tabs collaborates live on a proposal review; one tab submits, the other is redirected', async ({
    browser,
    page,
    studyFeatures,
}) => {
    const studyTitle = studyFeatures.uniqueTitle('proposal-review-two-tabs')

    let studyId = ''
    await test.step('seed: researcher submits a proposal', async () => {
        studyId = await createProposalAsResearcher(page, studyTitle)
    })

    let ctxA: Awaited<ReturnType<typeof openContextAsRole>> | undefined
    let ctxB: Awaited<ReturnType<typeof openContextAsRole>> | undefined

    try {
        await test.step('reviewer ctxA opens the proposal-review page', async () => {
            ctxA = await openContextAsRole(browser, {
                role: 'reviewer',
                url: `/openstax/study/${studyId}/review`,
            })
            await waitForOpenstaxOrgInClerkMetadata(ctxA.page)
            // Spy mode is React state — toggling it re-renders
            // ProposalReviewFeatureFlag under the flipped flag without a
            // reload. A hard reload would discard both spy mode and the
            // Clerk session in CI, so we avoid it.
            await enableSpyMode(ctxA.page)
            await expect(ctxA.page.getByTestId('review-feedback-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('reviewer ctxB opens the same proposal-review page in a separate context', async () => {
            ctxB = await openContextAsRole(browser, {
                role: 'reviewer',
                url: `/openstax/study/${studyId}/review`,
            })
            await waitForOpenstaxOrgInClerkMetadata(ctxB.page)
            await enableSpyMode(ctxB.page)
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
            // Select "approve" decision and click Submit review in ctxA.
            await ctxA!.page.getByRole('radio', { name: /^Approve$/i }).check()
            await ctxA!.page.getByRole('button', { name: /Submit review/i }).click()
            await ctxA!.page.getByRole('button', { name: /Yes, submit review/i }).click()

            // ctxA navigates to the post-submission review URL.
            await ctxA!.page.waitForURL(new RegExp(`/study/${studyId}/review`))
            await expect(ctxA!.page.getByTestId('review-feedback-section')).toBeHidden({ timeout: E2E_TIMEOUT })

            // ctxB receives the stateless broadcast and routes away from the
            // editable surface. The toast text is unit-tested in
            // use-submission-redirect-listener.test.ts; here we just assert
            // ctxB no longer renders the editable feedback section, which is
            // the AC-required behaviour (no further edits possible).
            await expect(ctxB!.page.getByTestId('review-feedback-section')).toBeHidden({ timeout: E2E_TIMEOUT })
        })
    } finally {
        await ctxA?.context.close()
        await ctxB?.context.close()
    }
})
