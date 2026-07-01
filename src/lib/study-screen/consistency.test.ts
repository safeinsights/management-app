import { describe, expect, it } from 'vitest'
import type { DashboardState, StudyState } from './state.types'
import { resolveDashboardAction, resolveScreen } from './resolve'

// Every href Tier-1 can emit must resolve to a NON-fallback screen for the same state.
// study-overview is the fallback; reaching it from a Tier-1 link means the tiers disagree.
const ctx = { orgSlug: 'lab', studyId: '01900000-0000-7000-8000-000000000001' }

const full = (overrides: Partial<StudyState>): StudyState => ({
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

describe('Tier-1 ↔ Tier-2 consistency', () => {
    // Representative states the dashboard 'View' link is emitted for (routes to /view).
    // PENDING-REVIEW with no job routes to /submitted (not /view), so it is excluded here;
    // its /view resolution to study-overview is intentional (generic layout), not a fallback.
    const viewStates: StudyState[] = [
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-APPROVED' }),
        full({ status: 'APPROVED', isDraft: false, codeAwaitingDecision: true, hasSubmittedCode: true }),
        full({ status: 'REJECTED', isDraft: false }),
        full({ status: 'CHANGE-REQUESTED', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true }),
        // Errored job, no reviewer files decision: the pill reads "Code approved", so the 'View' link
        // must resolve to a real screen (code-approved), never the study-overview fallback (OTTER-598).
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
            // These fixtures are all non-draft studies the dashboard sends to /view; assert that
            // explicitly so a future Tier-1 rule change can't silently make this invariant vacuous.
            expect(action.label).toBe('View')
            expect(resolveScreen('researcher', s, ctx).screen).not.toBe('study-overview')
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
            const id = resolveScreen('reviewer', s, ctx).screen
            expect(id.startsWith('reviewer-')).toBe(true)
        })
    }
})
