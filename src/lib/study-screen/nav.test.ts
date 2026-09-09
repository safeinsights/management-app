import { describe, expect, it } from 'vitest'
import type { Route } from 'next'
import type { StudyState } from './state.types'
import type { ResearcherScreenId } from './screens'
import { RESEARCHER_STEP_NAV, resolveStepNav, type NavCtx, type StepNav } from './nav'

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
        ['code-under-review', state({ status: 'APPROVED', isDraft: false, codeAwaitingDecision: true })],
        ['code-approved', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-APPROVED' })],
        ['code-feedback', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-CHANGES-REQUESTED' })],
        ['code-feedback', state({ status: 'APPROVED', isDraft: false, codeDecision: 'CODE-REJECTED' })],
        ['study-results', state({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true })],
        ['outputs-shared', state({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true })],
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

    // Their nav moves with the card that adds the read-only Step 1 page it depends on.
    it.each(['study-overview', 'proposal-feedback'] as const)('%s is left unconverted', (screen) => {
        expect(resolveStepNav(screen, state({ status: 'APPROVED', isDraft: false }), ctx)).toEqual({})
    })

    it('covers every researcher screen', () => {
        expect(Object.keys(RESEARCHER_STEP_NAV).sort()).toEqual([
            'code-approved',
            'code-feedback',
            'code-under-review',
            'outputs-errored-shared',
            'outputs-feedback',
            'outputs-pending',
            'outputs-shared',
            'proposal-feedback',
            'study-overview',
            'study-results',
        ])
    })
})

describe('resolveStepNav — code phase', () => {
    const submitted = { status: 'APPROVED', isDraft: false } as const

    // OTTER-727 hid the Agreements step, so the approved proposal is the step before this one.
    it('anchors "Previous step" to the approved proposal', () => {
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
