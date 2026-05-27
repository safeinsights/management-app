import { describe, expect, it } from 'vitest'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { decisionTimestampForProposalHeader, draftHasStep2Progress } from './studies'

const submittedAt = new Date('2025-04-16T10:00:00Z')
const approvedAt = new Date('2026-04-20T10:00:00Z')
const rejectedAt = new Date('2026-05-01T10:00:00Z')
const clarificationAt = new Date('2026-04-18T10:00:00Z')
const olderClarificationAt = new Date('2026-04-10T10:00:00Z')

const study = (
    overrides: Partial<Pick<SelectedStudy, 'status' | 'approvedAt' | 'rejectedAt' | 'submittedAt'>>,
): SelectedStudy =>
    ({
        status: 'PENDING-REVIEW',
        approvedAt: null,
        rejectedAt: null,
        submittedAt,
        ...overrides,
    }) as SelectedStudy

const entry = (
    overrides: Partial<Pick<ProposalFeedbackEntry, 'decision' | 'createdAt' | 'entryType'>>,
): ProposalFeedbackEntry =>
    ({
        id: 'entry-1',
        decision: 'APPROVE',
        createdAt: new Date('2026-04-16T10:00:00Z'),
        ...overrides,
    }) as ProposalFeedbackEntry

describe('decisionTimestampForProposalHeader', () => {
    it.each([
        {
            name: 'APPROVED uses approvedAt',
            study: study({ status: 'APPROVED', approvedAt }),
            entries: [] as ProposalFeedbackEntry[],
            expected: approvedAt,
        },
        {
            name: 'REJECTED uses rejectedAt',
            study: study({ status: 'REJECTED', rejectedAt }),
            entries: [],
            expected: rejectedAt,
        },
        {
            name: 'APPROVED falls back to submittedAt when approvedAt is null',
            study: study({ status: 'APPROVED', approvedAt: null }),
            entries: [],
            expected: submittedAt,
        },
        {
            name: 'REJECTED falls back to submittedAt when rejectedAt is null',
            study: study({ status: 'REJECTED', rejectedAt: null }),
            entries: [],
            expected: submittedAt,
        },
        {
            name: 'PENDING-REVIEW uses submittedAt, when no RESUBMISSION-NOTE entry is present',
            study: study({ status: 'PENDING-REVIEW' }),
            entries: [],
            expected: submittedAt,
        },
        {
            name: 'CHANGE-REQUESTED with empty entries uses submittedAt',
            study: study({ status: 'CHANGE-REQUESTED' }),
            entries: [],
            expected: submittedAt,
        },
        {
            name: 'CHANGE-REQUESTED with no clarification entry uses submittedAt',
            study: study({ status: 'CHANGE-REQUESTED' }),
            entries: [entry({ decision: 'APPROVE', createdAt: new Date('2026-04-16T10:00:00Z') })],
            expected: submittedAt,
        },
    ])('$name', ({ study: testStudy, entries, expected }) => {
        expect(decisionTimestampForProposalHeader(testStudy, entries)).toEqual(expected)
    })

    it('CHANGE-REQUESTED uses the latest NEEDS-CLARIFICATION entry (desc-ordered)', () => {
        const entries = [
            entry({ decision: 'NEEDS-CLARIFICATION', createdAt: clarificationAt }),
            entry({ decision: 'NEEDS-CLARIFICATION', createdAt: olderClarificationAt }),
        ]

        expect(decisionTimestampForProposalHeader(study({ status: 'CHANGE-REQUESTED' }), entries)).toEqual(
            clarificationAt,
        )
    })

    it('PENDING-REVIEW uses the latest RESUBMISSION-NOTE entry when present', () => {
        const olderResubmission = new Date('2026-04-25T10:00:00Z')
        const latestResubmission = new Date('2026-05-10T10:00:00Z')
        const entries = [
            entry({ createdAt: latestResubmission, entryType: 'RESUBMISSION-NOTE' }),
            entry({ createdAt: olderResubmission, entryType: 'RESUBMISSION-NOTE' }),
        ] as ProposalFeedbackEntry[]

        expect(decisionTimestampForProposalHeader(study({ status: 'PENDING-REVIEW' }), entries)).toEqual(
            latestResubmission,
        )
    })

    it('CHANGE-REQUESTED skips non-clarification entries before the latest clarification', () => {
        const entries = [
            entry({ decision: 'APPROVE', createdAt: new Date('2026-04-20T10:00:00Z') }),
            entry({ decision: 'NEEDS-CLARIFICATION', createdAt: clarificationAt }),
            entry({ decision: 'NEEDS-CLARIFICATION', createdAt: olderClarificationAt }),
        ]

        expect(decisionTimestampForProposalHeader(study({ status: 'CHANGE-REQUESTED' }), entries)).toEqual(
            clarificationAt,
        )
    })

    // note: a draft study should never be passed to this function, but we should
    // assert that it throws when submittedAt is null
    it('throws when submittedAt is null on the fallback path', () => {
        expect(() => decisionTimestampForProposalHeader(study({ status: 'DRAFT', submittedAt: null }), [])).toThrow(
            'submittedAt is required for proposal header timestamp',
        )
    })
})

const emptyDraftStep2 = {
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
}

describe('draftHasStep2Progress', () => {
    it('returns false when no Step 2 field has been written', () => {
        expect(draftHasStep2Progress(emptyDraftStep2)).toBe(false)
    })

    it('returns false when datasets is an empty array', () => {
        // An empty array means "explicitly cleared" rather than "never touched";
        // until a dataset is actually picked the researcher has nothing to resume on Step 2.
        expect(draftHasStep2Progress({ ...emptyDraftStep2, datasets: [] })).toBe(false)
    })

    it('returns true once a PI user has been selected', () => {
        expect(draftHasStep2Progress({ ...emptyDraftStep2, piUserId: 'user-123' })).toBe(true)
    })

    it('returns true once a dataset has been picked', () => {
        expect(draftHasStep2Progress({ ...emptyDraftStep2, datasets: ['students'] })).toBe(true)
    })

    it.each([['researchQuestions'], ['projectSummary'], ['impact'], ['additionalNotes']] as const)(
        'returns true once the %s lexical field has been saved',
        (field) => {
            const lexicalJson = { root: { children: [{ type: 'text', text: 'hi' }] } }
            expect(draftHasStep2Progress({ ...emptyDraftStep2, [field]: lexicalJson })).toBe(true)
        },
    )
})
