import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolvePillStatus, resolveRowHighlight } from './pill'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'APPROVED',
    isDraft: false,
    proposalDraftInProgress: false,
    hasStep2Progress: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: true,
    hasSubmittedCode: true,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 1,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'CODE-SUBMITTED',
    latestJobStatuses: [],
    ...overrides,
})

describe('resolvePillStatus', () => {
    // OTTER-636: while the researcher revises a change-requested proposal, their pill reads "Proposal
    // draft"; the reviewer keeps seeing "Change requested" (display-only, researcher-only).
    it('researcher sees Proposal draft when revising a change-requested proposal', () => {
        const label = resolvePillStatus(
            'researcher',
            state({ status: 'CHANGE-REQUESTED', proposalDraftInProgress: true, hasAnyJob: false }),
        )
        expect(label.stage).toBe('Proposal')
        expect(label.label).toBe('Draft')
    })
    it('reviewer still sees Change requested while the researcher revises', () => {
        const label = resolvePillStatus(
            'reviewer',
            state({ status: 'CHANGE-REQUESTED', proposalDraftInProgress: true, hasAnyJob: false }),
        )
        expect(label.label).toBe('Change requested')
    })

    it('researcher does NOT see Errored until a reviewer files a decision (falls back to Approved)', () => {
        const label = resolvePillStatus(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'],
                resultsErrored: true,
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(label.label).not.toBe('Errored')
        expect(label.label).toBe('Approved')
    })
    it('reviewer sees Errored immediately', () => {
        const label = resolvePillStatus(
            'reviewer',
            state({ latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'], resultsErrored: true }),
        )
        expect(label.label).toBe('Errored')
    })
    it('reviewer execution sub-status keeps its distinct label (Packaging)', () => {
        const label = resolvePillStatus(
            'reviewer',
            state({ latestJobStatuses: ['CODE-APPROVED', 'JOB-PACKAGING'], isExecuting: true }),
        )
        expect(label.label).toBe('Packaging')
    })
    it('researcher during execution shows Approved, NOT Packaging (no researcher exec label)', () => {
        const label = resolvePillStatus(
            'researcher',
            state({
                latestJobStatuses: ['CODE-APPROVED', 'JOB-PACKAGING'],
                isExecuting: true,
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(label.label).toBe('Approved')
    })
    // Deliberate divergence from legacy (which ranked CODE-CHANGES-REQUESTED higher): a job carrying
    // both a round-1 change-request and a terminal round-2 rejection reads "Rejected" — the truthful
    // terminal state, matching the code-rejected screen routing.
    it('job with both CODE-CHANGES-REQUESTED and CODE-REJECTED reads Rejected (terminal wins)', () => {
        const label = resolvePillStatus(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-REJECTED'],
                codeDecision: 'CODE-REJECTED',
            }),
        )
        expect(label.label).toBe('Rejected')
    })
    // OTTER-641: resubmit approved. The stale CODE-CHANGES-REQUESTED must not win over the live approval.
    it('resubmit then approved reads Approved, not the stale Change requested', () => {
        const label = resolvePillStatus(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'],
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(label.label).toBe('Approved')
    })
    // Reviewers DO have a label for CODE-CHANGES-REQUESTED, so before the fix the stale round-1 status
    // could win by DISPLAY_STATUS_PRIORITY. isStaleCodeDecision now runs for every role, so a reviewer
    // viewing an approved-after-resubmit job also reads the live decision.
    it('reviewer: resubmit then approved reads Approved, not the stale Change requested', () => {
        const label = resolvePillStatus(
            'reviewer',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'],
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(label.label).toBe('Approved')
    })
    // Researcher has no execution-status labels, so the pill falls through JOB-READY to the live code
    // decision; that must be the approval, not the superseded change-request from the earlier round.
    it('approved then executing still reads Approved for the researcher (falls through to live decision)', () => {
        const label = resolvePillStatus(
            'researcher',
            state({
                latestJobStatuses: ['CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY'],
                codeDecision: 'CODE-APPROVED',
                isExecuting: true,
            }),
        )
        expect(label.label).toBe('Approved')
    })
})

describe('resolveRowHighlight', () => {
    it('reviewer: pending review highlights', () => {
        expect(resolveRowHighlight('reviewer', state({ status: 'PENDING-REVIEW' }))).toBe(true)
    })
    it('reviewer: code awaiting decision highlights', () => {
        expect(resolveRowHighlight('reviewer', state({ codeAwaitingDecision: true }))).toBe(true)
    })
    it('researcher: results approved highlights', () => {
        expect(resolveRowHighlight('researcher', state({ resultsApproved: true }))).toBe(true)
    })
})
