import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolvePillId, resolvePillStatus, resolveRowHighlight } from './pill'
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

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }

describe('resolvePillId', () => {
    it('researcher does not see the error until a reviewer files a decision', () => {
        const id = resolvePillId(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'],
                resultsErrored: true,
                hasResults: true,
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(id).toBe('outputs-awaiting')
    })
    it('researcher sees the error once the reviewer shares a decision', () => {
        const id = resolvePillId(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED', 'FILES-APPROVED'],
                resultsErrored: true,
                resultsApproved: true,
                hasResults: true,
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(id).toBe('code-errored')
    })
    it('reviewer sees the error immediately', () => {
        const id = resolvePillId(
            'reviewer',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'],
                resultsErrored: true,
                hasResults: true,
            }),
        )
        expect(id).toBe('code-errored')
    })

    it('reviewer keeps a distinct label per enclave stage', () => {
        const stage = (statuses: StudyState['latestJobStatuses']) =>
            resolvePillId('reviewer', state({ latestJobStatuses: statuses, isExecuting: true }))
        expect(stage(['CODE-APPROVED', 'JOB-PACKAGING'])).toBe('code-preparing')
        expect(stage(['CODE-APPROVED', 'JOB-PACKAGING', 'JOB-READY'])).toBe('code-queued')
        expect(stage(['CODE-APPROVED', 'JOB-PACKAGING', 'JOB-PROVISIONING'])).toBe('code-queued')
        expect(stage(['CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING'])).toBe('code-running')
    })
    it('researcher collapses every enclave stage into one processing label', () => {
        const id = resolvePillId(
            'researcher',
            state({
                latestJobStatuses: ['CODE-APPROVED', 'JOB-PACKAGING'],
                isExecuting: true,
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(id).toBe('code-processing')
    })

    it('a declined code round is terminal, not a revision request', () => {
        const id = resolvePillId(
            'researcher',
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-REJECTED'],
                codeDecision: 'CODE-REJECTED',
            }),
        )
        expect(id).toBe('code-declined')
    })

    // OTTER-641: the stale CODE-CHANGES-REQUESTED must not win over the live approval.
    it.each(['researcher', 'reviewer'] as const)('%s: resubmit then approved reads approved', (role) => {
        const id = resolvePillId(
            role,
            state({
                latestJobStatuses: ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'],
                codeDecision: 'CODE-APPROVED',
            }),
        )
        expect(id).toBe('code-approved')
    })

    it('researcher outputs pill splits on whether the decision has been opened', () => {
        const decided: Partial<StudyState> = {
            latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'],
            hasResults: true,
            resultsApproved: true,
            codeDecision: 'CODE-APPROVED',
        }
        expect(resolvePillId('researcher', state({ ...decided, outputsViewed: false }))).toBe('outputs-need-review')
        expect(resolvePillId('researcher', state({ ...decided, outputsViewed: true }))).toBe('outputs-reviewed')
        // The reviewer made the decision, so it reads as reviewed for them either way.
        expect(resolvePillId('reviewer', state({ ...decided, outputsViewed: false }))).toBe('outputs-reviewed')
    })

    it('a completed run awaiting a decision reads as awaiting for the researcher, needs review for the reviewer', () => {
        const complete: Partial<StudyState> = {
            latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'],
            hasResults: true,
            codeDecision: 'CODE-APPROVED',
        }
        expect(resolvePillId('researcher', state(complete))).toBe('outputs-awaiting')
        expect(resolvePillId('reviewer', state(complete))).toBe('outputs-need-review')
    })

    it('a job with no submitted code reads as a draft to the researcher and awaited by the reviewer', () => {
        const noCode: Partial<StudyState> = {
            hasSubmittedCode: false,
            displayStatus: 'INITIATED',
            latestJobStatuses: [],
        }
        expect(resolvePillId('researcher', state(noCode))).toBe('code-draft')
        expect(resolvePillId('reviewer', state(noCode))).toBe('code-awaiting')
    })

    it('proposal statuses read differently to each role', () => {
        const proposal: Partial<StudyState> = { status: 'PENDING-REVIEW', hasAnyJob: false, hasSubmittedCode: false }
        expect(resolvePillId('researcher', state(proposal))).toBe('proposal-submitted')
        expect(resolvePillId('reviewer', state(proposal))).toBe('proposal-needs-review')

        const revision: Partial<StudyState> = { status: 'CHANGE-REQUESTED', hasAnyJob: false, hasSubmittedCode: false }
        expect(resolvePillId('researcher', state(revision))).toBe('proposal-needs-revision')
        expect(resolvePillId('reviewer', state(revision))).toBe('proposal-revision-requested')
    })

    it('a draft study reads as a proposal draft', () => {
        expect(resolvePillId('researcher', studyState())).toBe('proposal-draft')
    })
})

describe('resolvePillStatus', () => {
    it('interpolates the organization names into the tooltip', () => {
        const label = resolvePillStatus(
            'researcher',
            state({ status: 'PENDING-REVIEW', hasAnyJob: false, hasSubmittedCode: false }),
            NAMES,
        )
        expect(label.label).toBe('Proposal submitted')
        expect(label.tooltip).toBe('Waiting for Openstax to review proposal.')
    })

    it('gives the two roles different tooltips for the same badge', () => {
        const decided = state({
            latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'],
            hasResults: true,
            resultsApproved: true,
            outputsViewed: true,
            codeDecision: 'CODE-APPROVED',
        })
        expect(resolvePillStatus('researcher', decided, NAMES).tooltip).toBe(
            'You have reviewed the decision on your outputs. You can resubmit code if needed.',
        )
        expect(resolvePillStatus('reviewer', decided, NAMES).tooltip).toBe(
            'A decision on the outputs has been shared with Openstax Lab.',
        )
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
