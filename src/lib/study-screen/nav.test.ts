import { describe, expect, it } from 'vitest'
import type { Route } from 'next'
import type { StudyState } from './state.types'
import type { ResearcherScreenId, ReviewerScreenId } from './screens'
import {
    RESEARCHER_STEP_NAV,
    REVIEWER_STEP_NAV,
    phasedStepNav,
    resolveReviewerStepNav,
    resolveScreenNav,
    resolveProposalStatusNav,
    proposalStatusScreen,
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
    runErrored: false,
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
        ['proposal-feedback', state({ status: 'PENDING-REVIEW', isDraft: false, hasSubmittedCode: true })],
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

    it('a draft carries its forward action in the wizard footer, so the step nav is empty', () => {
        expect(resolveStepNav('study-overview', state({ status: 'DRAFT', isDraft: true }), ctx)).toEqual({})
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

describe('resolveStepNav — proposal phase', () => {
    const submitted = { isDraft: false } as const

    it('anchors "Previous step" to the read-only Step 1 record, carrying the entry point', () => {
        const nav = resolveStepNav('proposal-feedback', state({ ...submitted, status: 'APPROVED' }), {
            ...ctx,
            returnTo: 'org',
        })
        expect(nav.back).toMatchObject({ label: 'Previous step', variant: 'subtle', href: `${base}/edit?returnTo=org` })
    })

    it('under review: the Data Partner holds the next move, so the exit is elevated', () => {
        const nav = resolveStepNav('study-overview', state({ ...submitted, status: 'PENDING-REVIEW' }), ctx)
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
        expect(nav.back?.href).toBe(`${base}/edit`)
    })

    it('approved, no code yet: "Next step" opens Step 3', () => {
        const nav = resolveStepNav('proposal-feedback', state({ ...submitted, status: 'APPROVED' }), ctx)
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Next step'])
        expect(nav.forward?.href).toBe(`${base}/code`)
    })

    it('revision requested: "Edit proposal" is the solid action', () => {
        const nav = resolveStepNav('proposal-feedback', state({ ...submitted, status: 'CHANGE-REQUESTED' }), ctx)
        expect(nav.forward).toMatchObject({
            label: 'Edit proposal',
            variant: 'solid',
            href: `${base}/edit-and-resubmit`,
        })
    })

    it('declined is terminal, so the exit is the action', () => {
        const nav = resolveStepNav('proposal-feedback', state({ ...submitted, status: 'REJECTED' }), ctx)
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
    })

    // Submitting code and code decisions rewrite study.status; a submitted job means the proposal
    // was approved and this page was reached by walking back from the code phase.
    it.each(['PENDING-REVIEW', 'CHANGE-REQUESTED', 'REJECTED', 'APPROVED'] as const)(
        'once code is submitted, forward returns to the read-only code step (status %s)',
        (status) => {
            const nav = resolveStepNav('proposal-feedback', state({ ...submitted, status, hasSubmittedCode: true }), {
                ...ctx,
                returnTo: 'org',
            })
            expect(labels(nav)).toEqual(['Previous step', undefined, 'Next step'])
            expect(nav.forward?.href).toBe(`${base}/view/code?returnTo=org`)
        },
    )

    describe('proposalStatusScreen', () => {
        it('is the overview only while the proposal itself is under review', () => {
            expect(proposalStatusScreen(state({ ...submitted, status: 'PENDING-REVIEW' }))).toBe('study-overview')
            expect(proposalStatusScreen(state({ ...submitted, status: 'APPROVED' }))).toBe('proposal-feedback')
        })

        it('treats a study whose code is under review as a decided proposal', () => {
            const s = state({ ...submitted, status: 'PENDING-REVIEW', hasSubmittedCode: true })
            expect(proposalStatusScreen(s)).toBe('proposal-feedback')
            expect(resolveProposalStatusNav(s, ctx)).toEqual(resolveStepNav('proposal-feedback', s, ctx))
        })
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

    // Spec: "Code approved" always offers Next step — the outputs step exists from approval onward.
    it('code approved with no run yet → forward opens to the outputs step', () => {
        const nav = resolveStepNav('code-approved', state({ ...submitted, codeDecision: 'CODE-APPROVED' }), ctx)
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/view`, variant: 'solid' })
    })

    it('code approved with results → forward opens to the results step', () => {
        const nav = resolveStepNav(
            'code-approved',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', hasResults: true, resultsApproved: true }),
            ctx,
        )
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/view` })
    })

    // The outputs step still discloses nothing about the failure; it only stops being a dead end.
    it('an errored run still hidden from the researcher forwards to the outputs step (OTTER-598)', () => {
        const nav = resolveStepNav(
            'code-approved',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', hasResults: true, resultsErrored: true }),
            ctx,
        )
        expect(nav.forward).toMatchObject({ label: 'Next step', href: `${base}/view` })
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

describe('phasedStepNav', () => {
    it('keeps only Previous step while locked and the full nav once decrypted', () => {
        const s = state({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true })
        const nav = resolveStepNav('outputs-shared', s, ctx)
        const { locked, unlocked } = phasedStepNav(nav)
        expect(labels(locked)).toEqual(['Previous step', undefined, undefined])
        expect(unlocked).toBe(nav)
    })
})

describe('resolveScreenNav', () => {
    const approved = state({
        status: 'APPROVED',
        isDraft: false,
        hasSubmittedCode: true,
        codeDecision: 'CODE-APPROVED',
    })

    it('picks the table by role', () => {
        expect(resolveScreenNav('researcher', 'code-approved', approved, ctx)).toEqual(
            resolveStepNav('code-approved', approved, ctx),
        )
        expect(resolveScreenNav('reviewer', 'reviewer-code-feedback', approved, ctx)).toEqual(
            resolveReviewerStepNav('reviewer-code-feedback', approved, ctx),
        )
    })

    it("gives a screen outside its role's table no nav (the reviewer fallback to study-overview)", () => {
        expect(resolveScreenNav('reviewer', 'study-overview', approved, ctx)).toEqual({})
        expect(resolveScreenNav('researcher', 'reviewer-code-review', approved, ctx)).toEqual({})
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

describe('resolveReviewerStepNav — spec pattern invariants', () => {
    const approved = { status: 'APPROVED', isDraft: false, hasSubmittedCode: true } as const
    // Screens whose forward action is the form's own Submit / View button carry no solid nav action;
    // every other state must offer exactly one so no screen is a dead end.
    const formOwned: ReviewerScreenId[] = [
        'reviewer-proposal-review',
        'reviewer-agreements',
        'reviewer-code-review',
        'reviewer-outputs-errored',
        'reviewer-outputs-available',
    ]
    const everyScreen: Array<[ReviewerScreenId, StudyState]> = [
        ['reviewer-proposal-review', state({ status: 'PENDING-REVIEW', isDraft: false })],
        ['reviewer-proposal-feedback', state({ status: 'APPROVED', isDraft: false })],
        ['reviewer-proposal-feedback', state({ status: 'REJECTED', isDraft: false })],
        ['reviewer-proposal-feedback', state({ status: 'CHANGE-REQUESTED', isDraft: false })],
        ['reviewer-proposal-feedback', state({ ...approved })],
        ['reviewer-agreements', state({ ...approved })],
        ['reviewer-code-review', state({ ...approved, codeAwaitingDecision: true })],
        ['reviewer-code-feedback', state({ ...approved, codeDecision: 'CODE-APPROVED' })],
        ['reviewer-code-feedback', state({ ...approved, codeDecision: 'CODE-CHANGES-REQUESTED' })],
        ['reviewer-code-feedback', state({ ...approved, codeDecision: 'CODE-REJECTED' })],
        ['reviewer-outputs-pending', state({ ...approved, codeDecision: 'CODE-APPROVED' })],
        ['reviewer-outputs-pending', state({ ...approved, codeDecision: 'CODE-APPROVED', isExecuting: true })],
        ['reviewer-outputs-errored', state({ ...approved, hasResults: true, resultsErrored: true })],
        ['reviewer-outputs-available', state({ ...approved, hasResults: true, resultsDisplayStatus: 'RUN-COMPLETE' })],
        ['reviewer-outputs-decided', state({ ...approved, hasResults: true, resultsApproved: true })],
    ]

    it.each(everyScreen)('%s carries exactly one solid action unless the form owns it', (screen, s) => {
        const expected = formOwned.includes(screen) ? 0 : 1
        expect(solids(resolveReviewerStepNav(screen, s, ctx))).toBe(expected)
    })

    it('"Previous step" is always the quietest treatment', () => {
        for (const [screen, s] of everyScreen) {
            const { back } = resolveReviewerStepNav(screen, s, ctx)
            if (back) expect(back).toMatchObject({ label: 'Previous step', variant: 'subtle' })
        }
    })

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
})

describe('resolveReviewerStepNav — proposal phase', () => {
    it('the review form owns its only action', () => {
        expect(resolveReviewerStepNav('reviewer-proposal-review', state({ status: 'PENDING-REVIEW' }), ctx)).toEqual({})
    })

    it.each(['APPROVED', 'CHANGE-REQUESTED', 'REJECTED'] as const)(
        'a decided proposal with no code yet has no back and exits with "Back to my studies" (%s)',
        (status) => {
            const nav = resolveReviewerStepNav('reviewer-proposal-feedback', state({ status, isDraft: false }), ctx)
            expect(labels(nav)).toEqual([undefined, undefined, 'Back to my studies'])
            expect(nav.forward?.href).toBe('/dashboard')
        },
    )

    // Reached by walking back from the code step, so forward returns there.
    it('once code exists, forward is "Next step" to the read-only code step', () => {
        const s = state({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeAwaitingDecision: true })
        const nav = resolveReviewerStepNav('reviewer-proposal-feedback', s, ctx)
        expect(labels(nav)).toEqual([undefined, undefined, 'Next step'])
        expect(nav.forward?.href).toBe(`${base}/review/code`)
    })
})

describe('resolveReviewerStepNav — code phase', () => {
    const submitted = { status: 'APPROVED', isDraft: false, hasSubmittedCode: true } as const

    it('anchors "Previous step" to the decided proposal', () => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-review',
            state({ ...submitted, codeAwaitingDecision: true }),
            ctx,
        )
        expect(labels(nav)).toEqual(['Previous step', undefined, undefined])
        expect(nav.back?.href).toBe(`${base}/review/proposal`)
    })

    // Spec: "Code approved" always offers Next step, whether or not the run has started.
    it.each([
        ['before the enclave reports a stage', {}],
        ['while the job runs', { isExecuting: true }],
        ['once results have landed', { hasResults: true }],
    ] as const)('code approved steps forward to the outputs step %s', (_label, extra) => {
        const nav = resolveReviewerStepNav(
            'reviewer-code-feedback',
            state({ ...submitted, codeDecision: 'CODE-APPROVED', ...extra }),
            ctx,
        )
        expect(labels(nav)).toEqual(['Previous step', undefined, 'Next step'])
        expect(nav.forward?.href).toBe(`${base}/review`)
    })

    it.each(['CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'a %s decision leaves the next move elsewhere, so the exit is elevated',
        (codeDecision) => {
            const nav = resolveReviewerStepNav('reviewer-code-feedback', state({ ...submitted, codeDecision }), ctx)
            expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
        },
    )
})

describe('resolveReviewerStepNav — outputs phase', () => {
    const approved = {
        status: 'APPROVED',
        isDraft: false,
        hasSubmittedCode: true,
        codeDecision: 'CODE-APPROVED',
    } as const

    it.each(['reviewer-outputs-pending', 'reviewer-outputs-decided'] as const)(
        '%s anchors back to the approved-code step and exits with "Back to my studies"',
        (screen) => {
            const nav = resolveReviewerStepNav(screen, state({ ...approved, hasResults: true }), ctx)
            expect(labels(nav)).toEqual(['Previous step', undefined, 'Back to my studies'])
            expect(nav.back?.href).toBe(`${base}/review/code`)
        },
    )

    it.each(['reviewer-outputs-errored', 'reviewer-outputs-available'] as const)(
        '%s keeps only "Previous step": View and Submit decision belong to the panel',
        (screen) => {
            const s = state({ ...approved, hasResults: true })
            const { locked, unlocked } = phasedStepNav(resolveReviewerStepNav(screen, s, ctx))
            expect(labels(locked)).toEqual(['Previous step', undefined, undefined])
            expect(labels(unlocked)).toEqual(['Previous step', undefined, undefined])
            expect(unlocked.back?.href).toBe(`${base}/review/code`)
        },
    )
})
