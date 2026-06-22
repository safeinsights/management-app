import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolvePillStatus, resolveRowHighlight } from './pill'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'APPROVED',
    isDraft: false,
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
