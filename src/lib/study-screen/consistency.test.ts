import { describe, expect, it } from 'vitest'
import type { DashboardState, StudyState } from './state.types'
import { resolveDashboardAction, resolveScreen } from './resolve'
import { studyState } from './state.fixture'

// study-overview is the fallback; reaching it from a Tier-1 link means the tiers disagree.
const ctx = { orgSlug: 'lab', studyId: '01900000-0000-7000-8000-000000000001' }

const full = (overrides: Partial<StudyState>): StudyState => studyState(overrides)

describe('Tier-1 ↔ Tier-2 consistency', () => {
    // PENDING-REVIEW with no job routes to /submitted, so it is excluded: its study-overview
    // resolution is a generic layout, not a fallback.
    const viewStates: StudyState[] = [
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-APPROVED' }),
        full({ status: 'APPROVED', isDraft: false, codeAwaitingDecision: true, hasSubmittedCode: true }),
        full({ status: 'REJECTED', isDraft: false }),
        full({ status: 'CHANGE-REQUESTED', isDraft: false }),
        // Clean run whose outputs the reviewer shared → outputs-shared screen (OTTER-688).
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true }),
        // Undecided completed run → the results screen, the one state it still serves.
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsDisplayStatus: 'RUN-COMPLETE' }),

        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsErrored: true, resultsApproved: true }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsRejected: true }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsRejected: true, resultsErrored: true }),
        // Errored job with no reviewer files decision: the pill reads "Code approved", so this must
        // resolve to outputs-pending, never the study-overview fallback (OTTER-598).
        full({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            isExecuting: true,
            hasResults: true,
            resultsErrored: true,
        }),
    ]

    for (const s of viewStates) {
        it(`status=${s.status} code=${s.codeDecision} → 'View' route resolves to a real screen`, () => {
            const action = resolveDashboardAction('researcher', s as DashboardState, ctx)
            // Asserted so a future Tier-1 rule change cannot make this invariant vacuous.
            expect(action.label).toBe('View')
            expect(resolveScreen('researcher', s).screen).not.toBe('study-overview')
        })
    }
})

describe('reviewer rule table reaches no accidental fallback', () => {
    const reviewerStates: StudyState[] = [
        full({ status: 'PENDING-REVIEW', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false }),
        full({ status: 'REJECTED', isDraft: false }),
        full({ status: 'CHANGE-REQUESTED', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeAwaitingDecision: true }),
        full({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeAwaitingDecision: true,
            reviewerAgreementsAcked: true,
        }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-APPROVED' }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-CHANGES-REQUESTED' }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true }),
    ]

    for (const s of reviewerStates) {
        it(`reviewer status=${s.status} code=${s.codeDecision} → reviewer screen`, () => {
            const id = resolveScreen('reviewer', s).screen
            expect(id.startsWith('reviewer-')).toBe(true)
        })
    }
})
