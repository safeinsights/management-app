import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolvePillStatus, resolveRowHighlight } from './pill'
import { studyState } from './state.fixture'

const state = (overrides: Partial<StudyState>): StudyState =>
    studyState({
        status: 'APPROVED',
        isDraft: false,
        hasAnyJob: true,
        hasSubmittedCode: true,
        submissionRound: 1,
        displayStatus: 'CODE-SUBMITTED',
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
    // OTTER-641: the stale CODE-CHANGES-REQUESTED must not win over the live approval.
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
    // Reviewers DO have a label for CODE-CHANGES-REQUESTED, so the stale round-1 status could win
    // by DISPLAY_STATUS_PRIORITY were isStaleCodeDecision not applied to every role.
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
