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

// OTTER-544: two reviewers in the same DO editing live, one submits, the other
// is kicked out. The only behaviour that requires real WebSocket + Hocuspocus +
// Yjs + Lexical + action + redirect, across two browser contexts. Unit tests
// already cover auth, action enforcement, payload shape, Y.Map peer sync via
// mocked Hocuspocus, post-feedback rendering, and the reconnect-poll predicate;
// this spec deliberately does not duplicate any of that.
//
// Single reviewer credential constraint: the same Clerk reviewer signs in to
// two separate browser contexts. Each provider generates its own tabSessionId
// (random UUID), so the submission-listener's own-tab-skip still fires correctly
// across the two contexts. The "toast names a different user" cosmetic detail
// is unit-tested via the broadcast payload assertion in use-code-review-mutation.

// Seeding through the UI (researcher proposes, reviewer approves, researcher
// uploads code) plus the two-context collaboration steps put the test around
// 1-2 min; give it a generous budget on top of Playwright's default.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 120_000)
})

// 60+ words to satisfy FEEDBACK_MIN_WORDS=50.
const FEEDBACK_TEXT =
    'After reviewing the submitted code I have concerns about how the proposal alignment is handled and whether the agreements are fully respected. The security checks pass but the privacy protections need more attention before this can move forward. I am sharing this feedback so the team can iterate before resubmission and make sure the analysis matches the approved research questions and dataset usage outlined in the proposal.'

const CRITERIA_KEYS = ['proposalAlignment', 'agreementCompliance', 'securityChecks', 'privacyProtection'] as const

// ---------------------------------------------------------------------------
// Seed helpers (slimmed-down adaptation of helpers in tests/study-flow.spec.ts;
// kept inline to keep this spec self-contained and avoid refactor churn).
// ---------------------------------------------------------------------------

async function createProposalAsResearcher(page: Page, studyTitle: string): Promise<void> {
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

    await page.getByLabel('Study Title').fill(studyTitle)
    await page.getByPlaceholder('Select dataset(s) of interest').click()
    await page.getByRole('option').first().click()
    await fillLexicalField(page, 'Research question(s)', 'What is the effect of code-review collaboration?')
    await fillLexicalField(page, 'Project summary', 'Analyze how teammates review submitted code together.')
    await fillLexicalField(page, 'Impact', 'Improve reviewer throughput and reduce errors.')
    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    await page.getByRole('option').first().click()

    await page.getByRole('button', { name: /Submit study proposal/i }).click()
    await expect(page.getByText(/submitted successfully/i)).toBeVisible()
    await page.getByRole('link', { name: /Go to dashboard/i }).click()
    await page.waitForURL('**/dashboard')
}

async function approveProposalAsReviewer(page: Page, studyTitle: string): Promise<void> {
    await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await expect(async () => {
        await studyRow.getByRole('link', { name: 'View' }).first().click()
    }).toPass()
    await page.waitForURL(/\/study\//)
    await page.getByRole('button', { name: /Approve request/i }).click()
    await page.waitForURL('**/dashboard')
}

async function uploadCodeAsResearcher(page: Page, studyTitle: string): Promise<string> {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await expect(async () => {
        await studyRow.getByRole('link', { name: 'View' }).first().click()
    }).toPass()
    await page.waitForURL(/\/agreements(\?.*)?$/)
    await page.getByRole('button', { name: /Proceed to Step 4/i }).click()
    await page.waitForURL(/\/code$/)

    const studyId = page.url().match(/\/study\/([^/]+)/)![1]

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(['tests/fixtures/code-samples/main.r', 'tests/fixtures/code-samples/code.r'])
    await expect(page.getByRole('button', { name: /Submit code/i })).toBeEnabled()
    await page.getByRole('button', { name: /Submit code/i }).click()
    await page.waitForURL('**/dashboard')

    return studyId
}

// ---------------------------------------------------------------------------
// Code-review page helpers shared by both reviewer contexts.
// ---------------------------------------------------------------------------

// The collab UI (`code-review-feedback-section`) is gated behind
// `useCodeReviewCollaborationFeatureFlag` which requires spy mode = on.
// Spy mode is pure React state toggled by clicking the `𝜋` symbol fixed
// at the bottom of every page (no localStorage), so each fresh browser
// context must enable it once. The element has opacity:0 but
// `pointer-events: auto`, so a forced click reliably fires the handler.
// Spy mode adds `.spy-mode` to <body>; we assert that to confirm state
// flipped before relying on it gating downstream rendering.
async function enableSpyMode(page: Page): Promise<void> {
    await page.locator('.pi-symbol').click({ force: true })
    await expect(page.locator('body.spy-mode')).toBeAttached()
}

// `useCodeReviewCollaborationFeatureFlag` returns false until the user's
// `session.orgs` includes an OpenStax slug. After a Clerk testing-token sign-in,
// `user.publicMetadata.orgs` is populated either directly (if Clerk already
// has it) or via a `syncUserMetadataAction` fallback that round-trips to the
// server. Wait for the metadata to actually contain `openstax` so the feature
// flag can flip true. If this times out, the failure message points squarely
// at the seed-side issue rather than at downstream editor mounting.
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
    page.getByTestId('code-review-feedback-section').locator('[contenteditable="true"]').first()

// Hocuspocus auth + Y.Doc sync can take 10-20s in dev with two concurrent
// contexts; the inner contenteditable only appears after the editor's phase
// reaches 'connected'. Wait explicitly so subsequent click/type operations
// have something to target.
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

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('a reviewer in two tabs collaborates live; one tab submits, the other is redirected with the submission toast', async ({
    browser,
    page,
    studyFeatures,
}) => {
    test.skip(!!process.env.CI, 'Hocuspocus editor service not yet wired in CI')

    const studyTitle = studyFeatures.uniqueTitle('two-tabs-collab')
    let studyId = ''

    await test.step('seed: researcher proposes, reviewer approves, researcher uploads code', async () => {
        await createProposalAsResearcher(page, studyTitle)
        await approveProposalAsReviewer(page, studyTitle)
        studyId = await uploadCodeAsResearcher(page, studyTitle)
    })

    // Open two reviewer contexts. The first goes through the per-study agreements
    // flow (clicks "Proceed to Step 3", landing on /review?from=agreements-proceed);
    // the second navigates directly to /review with the same query param, which
    // bypasses the agreements gate in page.tsx (the route only redirects when
    // both `from !== 'agreements-proceed'` AND the study has no recorded ack).
    let ctxA: Awaited<ReturnType<typeof openContextAsRole>> | undefined
    let ctxB: Awaited<ReturnType<typeof openContextAsRole>> | undefined

    try {
        await test.step('reviewer ctxA opens the code-review page via agreements', async () => {
            ctxA = await openContextAsRole(browser, {
                role: 'reviewer',
                url: `/openstax/study/${studyId}/agreements`,
            })
            await ctxA.page.waitForURL(/\/agreements(\?.*)?$/)
            await waitForOpenstaxOrgInClerkMetadata(ctxA.page)
            // Enable spy mode while on /agreements; survives SPA navigation to /review.
            await enableSpyMode(ctxA.page)
            await ctxA.page.getByRole('button', { name: /Proceed to Step 3/i }).click()
            await ctxA.page.waitForURL(/\/review\?from=agreements-proceed$/)
            await expect(ctxA.page.getByTestId('code-review-feedback-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('reviewer ctxB opens the code-review page directly', async () => {
            ctxB = await openContextAsRole(browser, {
                role: 'reviewer',
                url: `/openstax/study/${studyId}/review?from=agreements-proceed`,
            })
            await waitForOpenstaxOrgInClerkMetadata(ctxB.page)
            await enableSpyMode(ctxB.page)
            await expect(ctxB.page.getByTestId('code-review-feedback-section')).toBeVisible({ timeout: E2E_TIMEOUT })
        })

        await test.step('feedback typed in ctxA syncs to ctxB in real time', async () => {
            // Both contexts must complete Hocuspocus auth + Y.Doc sync before
            // the Lexical contenteditable appears.
            await waitForFeedbackEditorReady(ctxA!.page)
            await waitForFeedbackEditorReady(ctxB!.page)

            const editorA = feedbackEditorIn(ctxA!.page)
            await editorA.click()
            await ctxA!.page.keyboard.type(FEEDBACK_TEXT)
            await expect(feedbackEditorIn(ctxB!.page)).toContainText(FEEDBACK_TEXT.slice(0, 60), {
                timeout: E2E_TIMEOUT,
            })
        })

        await test.step('ctxA selects Yes on Proposal alignment; ctxB sees the selection; ctxB clears; ctxA sees the clear', async () => {
            // Sanity: both contexts still in collab view (not legacy/redirect).
            await expect(ctxA!.page.getByTestId('code-evaluation-section')).toBeVisible()
            await expect(ctxB!.page.getByTestId('code-evaluation-section')).toBeVisible()

            const radioYesA = criterionRadioIn(ctxA!.page, 'proposalAlignment', 'yes')
            await radioYesA.check()
            await expect(radioYesA).toBeChecked()

            const radioYesB = criterionRadioIn(ctxB!.page, 'proposalAlignment', 'yes')
            await expect(radioYesB).toBeChecked({ timeout: E2E_TIMEOUT })

            await ctxB!.page.getByTestId('criteria-clear-proposalAlignment').click()
            await expect(radioYesA).not.toBeChecked({ timeout: E2E_TIMEOUT })
        })

        await test.step('ctxA completes criteria + decision, submits; ctxB is redirected with the submission toast', async () => {
            await fillAllCriteriaYes(ctxA!.page)
            await ctxA!.page.getByTestId('code-review-decision-approve').click()
            await ctxA!.page.getByTestId('code-review-submit').click()
            await ctxA!.page.getByRole('button', { name: /Yes, submit review/i }).click()
            await ctxA!.page.waitForURL(/\?from=code-review/)

            // The toast title is unit-tested in use-submission-redirect-listener.test.ts;
            // here we just assert ctxB redirected, which is the functional kick-out
            // behaviour the AC actually requires. The toast renders briefly and then
            // `router.push` navigates away, so racing the DOM read against the
            // navigation would be flaky.
            await ctxB!.page.waitForURL(/\?from=code-review/)

            // Both contexts should land on the OTTER-501 post-feedback view rendered
            // for kind=CODE (not the proposal-review fallback or a blank page).
            // post-feedback-view.test.tsx covers the rendering against mocked entries;
            // this asserts the real action → DB → page-render integration so a
            // broken transition surfaces as a clear assertion failure rather than
            // as a silent stuck-on-blank-page experience.
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
