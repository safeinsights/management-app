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
    ...overrides,
})

describe('resolvePillStatus', () => {
    it('researcher does NOT see Errored until a reviewer files a decision', () => {
        const label = resolvePillStatus('researcher', state({ displayStatus: 'JOB-ERRORED', resultsErrored: true }))
        expect(label.label).not.toBe('Errored')
    })
    it('reviewer sees Errored immediately', () => {
        const label = resolvePillStatus('reviewer', state({ displayStatus: 'JOB-ERRORED', resultsErrored: true }))
        expect(label.label).toBe('Errored')
    })
    it('execution sub-status keeps its distinct label (Packaging)', () => {
        const label = resolvePillStatus('researcher', state({ displayStatus: 'JOB-PACKAGING', isExecuting: true }))
        expect(label.label).toBe('Packaging')
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
