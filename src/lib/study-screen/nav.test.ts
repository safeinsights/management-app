import { describe, expect, it } from 'vitest'
import type { Route } from 'next'
import type { StudyState } from './state.types'
import type { ResearcherScreenId } from './screens'
import {
    RESEARCHER_STEP_NAV,
    REVIEWER_STEP_NAV,
    resolveReviewerStepNav,
    resolveStepNav,
    type NavCtx,
    type StepNav,
} from './nav'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
    hasStep2Progress: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: false,
    hasSubmittedCode: false,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 0,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'DRAFT',
    latestJobStatuses: [],
    ...overrides,
})

const STUDY_ID = '01900000-0000-7000-8000-000000000001'
const ctx: NavCtx = { orgSlug: 'lab', studyId: STUDY_ID, dashboardHref: '/dashboard' as Route }

const base = `/lab/study/${STUDY_ID}`
const labels = (nav: StepNav) => [nav.back?.label, nav.secondary?.label, nav.forward?.label]
const solids = (nav: StepNav) => [nav.back, nav.secondary, nav.forward].filter((a) => a?.variant === 'solid').length

describe('resolveStepNav — spec pattern invariants', () => {
    // "Every state contains one solid button to ensure the user never encounters a dead end."
    // The draft overview is the sole exemption: its forward action lives in the wizard footer.
    const everyScreen: Array<[ResearcherScreenId, StudyState]> = [
        ['study-overview', state({ status: 'PENDING-REVIEW', isDraft: false })],
        ['proposal-feedback', state({ status: 'APPROVED', isDraft: false })],
        ['proposal-feedback', state({ status: 'CHANGE-REQUESTED', isDraft: false })],
        ['proposal-feedback', state({ status: 'REJECTED', isDraft: false })],
        ['code-under-review', state({ status: 'APPROVED', isDraft: false, codeAwaitingDecision: true })],
        ['code-approved', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-APPROVED' })],
        ['code-feedback', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-CHANGES-REQUESTED' })],
        ['code-feedback', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-REJECTED' })],
        ['study-results', state({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true })],
        ['study-results', state({ status: 'APPROVED', isDraft: false, hasResults: true, resultsRejected: true })],
    ]

    it.each(everyScreen)('%s carries exactly one solid action', (screen, s) => {
        expect(solids(resolveStepNav(screen, s, ctx))).toBe(1)
    })

    it('"Previous step" is always the quietest treatment', () => {
        for (const [screen, s] of everyScreen) {
            const { back } = resolveStepNav(screen, s, ctx)
            if (back) expect(back).toMatchObject({ label: 'Previous step', variant: 'subtle' })
        }
    })

    it('a draft shows no step nav — its forward action is the wizard footer', () => {
        expect(resolveStepNav('study-overview', state({ isDraft: true }), ctx)).toEqual({})
    })

    it('covers every researcher screen', () => {
        expect(Object.keys(RESEARCHER_STEP_NAV).sort()).toEqual([
            'code-approved',
            'code-feedback',
            'code-under-review',
            'outputs-errored-shared',
            'outputs-feedback',
            'outputs-pending',
            'proposal-feedback',
            'study-overview',
            'study-results',
        ])
    })
})

describe('resolveStepNav — proposal phase', () => {
    // Regression guard for the gap, not the desired end state: the spec's target (read-only Step 1,
    // Figma 530-26405) has no route, and Routes.studyEdit 404s outside DRAFT. Hiding beats a dead link.
    it('hides "Previous step" while read-only Step 1 does not exist', () => {
        for (const status of ['PENDING-REVIEW', 'APPROVED', 'CHANGE-REQUESTED', 'REJECTED'] as const) {
            const screen = status === 'PENDING-REVIEW' ? 'study-overview' : 'proposal-feedback'
            expect(resolveStepNav(screen, state({ status, isDraft: false }), ctx).back).toBeUndefined()
        }
    })

    it('submitted, awaiting the data partner → forward blocked, exit is elevated', () => {
        const nav = resolveStepNav('study-overview', state({ status: 'PENDING-REVIEW', isDraft: false }), ctx)
        expect(nav.forward).toMatchObject({ label: 'Back to my studies', href: '/dashboard', variant: 'solid' })
    })

    it('approved → "Next step" to the code step', () => {
        const nav = resolveStepNav('proposal-feedback', state({ status: 'APPROVED', isDraft: false }), ctx)
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/code`, variant: 'solid' })
    })

    it('approved but code already submitted → "Next step" to the read-only code step, not the upload page', () => {
        const nav = resolveStepNav(
            'proposal-feedback',
            state({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true }),
            ctx,
        )
        expect(nav.forward?.href).toBe(`${base}/view/code`)
    })

    it('revision requested → "Edit proposal" kicks off the correction', () => {
        const nav = resolveStepNav('proposal-feedback', state({ status: 'CHANGE-REQUESTED', isDraft: false }), ctx)
        expect(nav.forward).toMatchObject({
            label: 'Edit proposal',
            href: `${base}/edit-and-resubmit`,
            variant: 'solid',
        })
    })

    it('declined → terminal negative still offers a friction-free way out', () => {
        const nav = resolveStepNav('proposal-feedback', state({ status: 'REJECTED', isDraft: false }), ctx)
        expect(labels(nav)).toEqual([undefined, undefined, 'Back to my studies'])
    })
})

describe('resolveStepNav — code phase', () => {
    const submitted = { status: 'APPROVED', isDraft: false } as const

    it('anchors "Previous step" to the approved proposal, not to Agreements', () => {
        const nav = resolveStepNav('code-under-review', state({ ...submitted, codeAwaitingDecision: true }), ctx)
        expect(nav.back?.href).toBe(`${base}/submitted`)
    })

    it('code submitted, awaiting a decision → forward blocked', () => {
        const nav = resolveStepNav('code-under-review', state({ ...submitted, codeAwaitingDecision: true }), ctx)
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    it('code approved with no results yet → forward blocked until the run lands', () => {
        const nav = resolveStepNav('code-approved', state({ ...submitted, codeDecision: 'CODE-APPROVED' }), ctx)
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    it('code approved with results → forward opens to the results step', () => {
        const nav = resolveStepNav(
            'code-approved',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', hasResults: true, resultsApproved: true }),
            ctx,
        )
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/view` })
    })

    it('an errored run still hidden from the researcher does not open forward (OTTER-598)', () => {
        const nav = resolveStepNav(
            'code-approved',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', hasResults: true, resultsErrored: true }),
            ctx,
        )
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    it('code revision requested → "Edit code" is the forward action', () => {
        const nav = resolveStepNav(
            'code-feedback',
            state({ ...submitted, codeDecision: 'CODE-CHANGES-REQUESTED' }),
            ctx,
        )
        expect(nav.forward).toMatchObject({ label: 'Edit code', href: `${base}/resubmit`, variant: 'solid' })
    })

    it('code rejected → terminal, no further submissions offered', () => {
        const nav = resolveStepNav('code-feedback', state({ ...submitted, codeDecision: 'CODE-REJECTED' }), ctx)
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
    })
})

describe('resolveStepNav — outputs phase', () => {
    const withResults = { status: 'APPROVED', isDraft: false, hasResults: true } as const

    it('running in the enclave has nothing ahead, so the exit is elevated', () => {
        const nav = resolveStepNav(
            'outputs-pending',
            state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-APPROVED', isExecuting: true }),
            ctx,
        )
        expect(nav.back?.href).toBe(`${base}/view/code`)
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    // Feedback shared without outputs, and an errored run whose outputs were shared: the forward
    // action in both is the next iteration.
    it.each(['outputs-feedback', 'outputs-errored-shared'] as const)('%s promotes "Edit code"', (screen) => {
        const nav = resolveStepNav(screen, state({ ...withResults, resultsRejected: true }), ctx)
        expect(nav.back?.href).toBe(`${base}/view/code`)
        expect(nav.forward).toMatchObject({ label: 'Edit code', href: `${base}/resubmit`, variant: 'solid' })
    })

    it('anchors "Previous step" to the approved-code step', () => {
        const nav = resolveStepNav('study-results', state({ ...withResults, resultsApproved: true }), ctx)
        expect(nav.back?.href).toBe(`${base}/view/code`)
    })

    it('outputs shared → exit is primary, "Edit code" is the optional further iteration', () => {
        const nav = resolveStepNav('study-results', state({ ...withResults, resultsApproved: true }), ctx)
        expect(nav.secondary).toMatchObject({ label: 'Edit code', variant: 'outline' })
        expect(nav.forward).toMatchObject({ label: 'Back to my studies', variant: 'solid' })
    })

    it('feedback only → "Edit code" is promoted to the primary action', () => {
        const nav = resolveStepNav('study-results', state({ ...withResults, resultsRejected: true }), ctx)
        expect(nav.secondary).toBeUndefined()
        expect(nav.forward).toMatchObject({ label: 'Edit code', variant: 'solid' })
    })

    it('results not resubmittable → plain exit', () => {
        const nav = resolveStepNav('study-results', state({ ...withResults }), ctx)
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
    })
})

describe('resolveReviewerStepNav — Data Partner', () => {
    const submitted = { status: 'APPROVED', isDraft: false } as const

    it('covers every reviewer screen', () => {
        expect(Object.keys(REVIEWER_STEP_NAV).sort()).toEqual([
            'reviewer-agreements',
            'reviewer-code-feedback',
            'reviewer-code-review',
            'reviewer-outputs-available',
            'reviewer-outputs-decided',
            'reviewer-outputs-errored',
            'reviewer-outputs-pending',
            'reviewer-proposal-feedback',
            'reviewer-proposal-review',
        ])
    })

    // OTTER-754 owns that page's navigation; contributing nav here would fight Stella's card.
    it('leaves the proposal review screen alone', () => {
        expect(resolveReviewerStepNav('reviewer-proposal-review', state(submitted), ctx)).toEqual({})
    })

    it('gives the agreements gate no step nav — it has its own footer and no rows in the spec', () => {
        expect(resolveReviewerStepNav('reviewer-agreements', state(submitted), ctx)).toEqual({})
    })

    it('post-decision proposal exits without a back button', () => {
        const nav = resolveReviewerStepNav('reviewer-proposal-feedback', state(submitted), ctx)
        expect(nav.back).toBeUndefined()
        expect(nav.forward).toMatchObject({ label: 'Back to my studies', variant: 'solid' })
    })

    it('anchors code-phase back to the decided proposal', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-review',
            state({ ...submitted, codeAwaitingDecision: true }),
            ctx,
        )
        expect(nav.back?.href).toBe(`${base}/review/proposal`)
        // "Submit decision" opens a modal rather than navigating, so the decision form keeps it.
        expect(nav.forward).toBeUndefined()
    })

    it('approved code with no results yet has nothing ahead', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-feedback',
            state({ ...submitted, codeDecision: 'CODE-APPROVED' }),
            ctx,
        )
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    it('approved code with results forwards to them', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-feedback',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', hasResults: true }),
            ctx,
        )
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/review` })
    })

    it('revision requested is terminal for the reviewer', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-feedback',
            state({ ...submitted, codeDecision: 'CODE-CHANGES-REQUESTED' }),
            ctx,
        )
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
    })

    it('anchors outputs-phase back to the approved-code step', () => {
        const nav = resolveReviewerStepNav('reviewer-outputs-decided', state({ ...submitted, hasResults: true }), ctx)
        expect(nav.back?.href).toBe(`${base}/review/code`)
        expect(nav.forward?.label).toBe('Back to my studies')
    })

    // Both undecided outputs screens offer "View" (decrypt) and then "Submit decision" — page
    // actions, not navigations — so the table gives them only the back link.
    it.each(['reviewer-outputs-errored', 'reviewer-outputs-available'] as const)(
        '%s carries only the back link',
        (screen) => {
            const nav = resolveReviewerStepNav(screen, state({ ...submitted, hasResults: true }), ctx)
            expect(nav.back?.href).toBe(`${base}/review/code`)
            expect(nav.forward).toBeUndefined()
        },
    )

    // The "exactly one solid" rule is about the rendered page, not this table. On the screens whose
    // primary action is "Submit decision" the solid button belongs to the decision form, so the nav
    // table contributes none — asserted explicitly below so a future edit can't add a second one.
    it('carries the single solid action on the screens that own one', () => {
        const cases = [
            ['reviewer-proposal-feedback', state(submitted)],
            ['reviewer-code-feedback', state({ ...submitted, codeDecision: 'CODE-APPROVED' })],
            ['reviewer-outputs-pending', state({ ...submitted, isExecuting: true })],
            ['reviewer-outputs-decided', state({ ...submitted, hasResults: true })],
        ] as const
        for (const [screen, s] of cases) {
            expect(solids(resolveReviewerStepNav(screen, s, ctx))).toBe(1)
        }
    })

    it('contributes no solid action where the decision form owns it', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-review',
            state({ ...submitted, codeAwaitingDecision: true }),
            ctx,
        )
        expect(solids(nav)).toBe(0)
    })
})
