import { StudyJobStatus, StudyStatus } from '@/database/types'
import { describe, expect, it } from 'vitest'
import { useStudyStatus, UseStudyStatusParams } from './use-study-status'

describe('useStudyStatus', () => {
    const createTestParams = (
        studyStatus: StudyStatus,
        audience: 'reviewer' | 'researcher',
        jobStatusChanges: Array<{ status: StudyJobStatus }> = [],
    ): UseStudyStatusParams => ({
        studyStatus,
        audience,
        jobStatusChanges,
    })

    describe('basic functionality', () => {
        it('returns study status when no job status changes are provided', () => {
            const params = createTestParams('PENDING-REVIEW', 'researcher')
            const result = useStudyStatus(params)

            expect(result).toEqual({
                stage: 'Proposal',
                label: 'Under Review',
                tooltip: "Your proposal is being reviewed. You'll receive an email once a decision is made.",
            })
        })

        it('prioritizes job status over study status when available', () => {
            const params = createTestParams('APPROVED', 'researcher', [{ status: 'RUN-COMPLETE' }])
            const result = useStudyStatus(params)

            expect(result.stage).toBe('Results')
            expect(result?.label).toBe('Under Review')
        })

        it('falls back to study status when job status is not found in status keys', () => {
            const params = createTestParams('APPROVED', 'researcher', [{ status: 'JOB-PROVISIONING' }])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Approved')
        })
    })

    describe('audience-specific behavior', () => {
        it('shows different labels for researcher vs reviewer audiences', () => {
            const studyStatus: StudyStatus = 'PENDING-REVIEW'

            const researcherResult = useStudyStatus(createTestParams(studyStatus, 'researcher'))
            const reviewerResult = useStudyStatus(createTestParams(studyStatus, 'reviewer'))

            expect(researcherResult?.label).toBe('Under Review')
            expect(reviewerResult?.label).toBe('Needs Review')
        })

        it('uses correct status keys for each audience', () => {
            const params1 = createTestParams('APPROVED', 'researcher', [{ status: 'CODE-APPROVED' }])
            const params2 = createTestParams('APPROVED', 'reviewer', [{ status: 'CODE-APPROVED' }])

            const researcherResult = useStudyStatus(params1)
            const reviewerResult = useStudyStatus(params2)

            // Labels should be the same for this status since both audiences have it
            expect(researcherResult?.label).toBe('Approved')
            expect(reviewerResult?.label).toBe('Approved')
        })
    })

    describe('error status filtering for researchers', () => {
        it('filters out JOB-ERRORED status for researchers when files have not been reviewed', () => {
            const params = createTestParams('APPROVED', 'researcher', [{ status: 'JOB-ERRORED' }])
            const result = useStudyStatus(params)

            // Should fall back to study status since JOB-ERRORED is filtered out
            expect(result?.label).toBe('Approved')
        })

        it('shows JOB-ERRORED status for researchers when files have been approved and job has errored', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'JOB-ERRORED' },
                { status: 'FILES-APPROVED' },
            ])
            const result = useStudyStatus(params)

            // JOB-ERRORED is persisted after FILES-APPROVED
            expect(result?.label).toBe('Errored')
        })

        it('shows JOB-ERRORED status for researchers when files have been rejected and job has errored', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'JOB-ERRORED' },
                { status: 'FILES-REJECTED' },
                { status: 'JOB-ERRORED' },
            ])
            const result = useStudyStatus(params)

            // JOB-ERRORED is persisted after FILES-REJECTED
            expect(result?.label).toBe('Errored')
        })

        it('does not filter JOB-ERRORED status for reviewers', () => {
            const params = createTestParams('APPROVED', 'reviewer', [{ status: 'JOB-ERRORED' }])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Errored')
        })
    })

    describe('multiple status changes', () => {
        it('processes multiple job status changes correctly', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'RUN-COMPLETE' },
                { status: 'JOB-RUNNING' },
                { status: 'CODE-APPROVED' },
            ])
            const result = useStudyStatus(params)

            // Should find the most relevant status based on priority order
            expect(result.stage).toBe('Results')
        })

        it('handles mixed status types in correct priority order', () => {
            const params = createTestParams('PENDING-REVIEW', 'researcher', [
                { status: 'FILES-APPROVED' },
                { status: 'RUN-COMPLETE' },
                { status: 'JOB-RUNNING' },
                { status: 'CODE-APPROVED' },
            ])
            const result = useStudyStatus(params)

            // Should prioritize based on the status keys order
            expect(result?.label).toBe('Approved')
        })
    })

    describe('edge cases', () => {
        it('returns undefined when no matching status is found', () => {
            // Create a scenario where no status matches the status keys
            const params = createTestParams('DRAFT' as StudyStatus, 'researcher', [])
            const result = useStudyStatus(params)

            expect(result).toBeUndefined()
        })

        it('handles empty job status changes array', () => {
            const params = createTestParams('APPROVED', 'researcher', [])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Approved')
        })

        it('handles undefined status label gracefully', () => {
            // Test with a status that might not have a corresponding label
            const params = createTestParams('REJECTED', 'researcher')
            const result = useStudyStatus(params)

            // Should still return the result even if label might be undefined
            expect(result).toBeDefined()
            expect(result?.label).toBe('Rejected')
        })
    })

    describe('status priority and ordering', () => {
        it('respects the reversed order of status keys for priority', () => {
            // Test that later statuses in the original definition take priority
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'RUN-COMPLETE' },
            ])
            const result = useStudyStatus(params)

            // RUN-COMPLETE should have higher priority than CODE-APPROVED
            expect(result.stage).toBe('Results')
        })

        it('finds the first matching status in priority order, not chronological order', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' }, // Latest chronologically
                { status: 'RUN-COMPLETE' }, // Earlier chronologically
            ])
            const result = useStudyStatus(params)

            // Should prioritize RUN-COMPLETE despite being chronologically earlier
            expect(result.stage).toBe('Results')
        })
    })

    describe('file review status edge cases', () => {
        it('prioritizes most recent file status when both approval and rejection are present', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'FILES-REJECTED' },
                { status: 'FILES-APPROVED' },
            ])
            const result = useStudyStatus(params)

            // Should show FILES-REJECTED since it has highest priority
            expect(result?.label).toBe('Rejected')
        })
    })
})
