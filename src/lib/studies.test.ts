import { describe, expect, it } from 'vitest'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { decisionTimestampForProposalHeader } from './studies'

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

const entry = (overrides: Partial<Pick<ProposalFeedbackEntry, 'decision' | 'createdAt'>>): ProposalFeedbackEntry =>
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
            name: 'PENDING-REVIEW uses submittedAt',
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
