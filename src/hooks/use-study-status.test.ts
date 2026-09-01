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

            expect(result).toEqual(
                expect.objectContaining({
                    stage: 'Proposal',
                    label: 'Under Review',
                    tooltip: "Your study proposal is being reviewed. You'll receive an email once a decision is made.",
                }),
            )
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

        it('shows code change requested labels for both audiences when the job status is CODE-CHANGES-REQUESTED', () => {
            const params = (audience: 'researcher' | 'reviewer') =>
                createTestParams('APPROVED', audience, [{ status: 'CODE-CHANGES-REQUESTED' }])

            const researcherResult = useStudyStatus(params('researcher'))
            const reviewerResult = useStudyStatus(params('reviewer'))

            expect(researcherResult).toEqual(
                expect.objectContaining({
                    stage: 'Code',
                    label: 'Change requested',
                }),
            )
            expect(reviewerResult).toEqual(
                expect.objectContaining({
                    stage: 'Code',
                    label: 'Change requested',
                }),
            )
        })

        it('shows proposal change requested labels for both audiences', () => {
            const studyStatus: StudyStatus = 'CHANGE-REQUESTED'

            const researcherResult = useStudyStatus(createTestParams(studyStatus, 'researcher'))
            const reviewerResult = useStudyStatus(createTestParams(studyStatus, 'reviewer'))

            expect(researcherResult).toEqual(
                expect.objectContaining({
                    stage: 'Proposal',
                    label: 'Change requested',
                }),
            )
            expect(reviewerResult).toEqual(
                expect.objectContaining({
                    stage: 'Proposal',
                    label: 'Change requested',
                }),
            )
        })

        it('uses correct status keys for each audience', () => {
            const params1 = createTestParams('APPROVED', 'researcher', [{ status: 'CODE-APPROVED' }])
            const params2 = createTestParams('APPROVED', 'reviewer', [{ status: 'CODE-APPROVED' }])

            const researcherResult = useStudyStatus(params1)
            const reviewerResult = useStudyStatus(params2)

            expect(researcherResult?.label).toBe('Approved')
            expect(reviewerResult?.label).toBe('Approved')
        })
    })

    describe('error status handling for researchers', () => {
        it('hides JOB-ERRORED from researchers until the reviewer has reviewed the error logs', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'JOB-ERRORED' },
            ])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Approved')
            expect(result.stage).toBe('Code')
        })

        it('shows JOB-ERRORED to researchers once the reviewer has approved the error logs', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'JOB-ERRORED' },
                { status: 'FILES-APPROVED' },
            ])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Errored')
        })

        it('shows JOB-ERRORED to researchers once the reviewer has rejected the error logs', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'JOB-ERRORED' },
                { status: 'FILES-REJECTED' },
            ])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Errored')
        })

        it('shows JOB-ERRORED to reviewers immediately, without waiting for file review', () => {
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

            expect(result?.label).toBe('Ready')
        })
    })

    describe('edge cases', () => {
        it('returns DRAFT status as fallback when no matching status is found', () => {
            const params = createTestParams('UNKNOWN' as unknown as StudyStatus, 'researcher', [])
            const result = useStudyStatus(params)

            expect(result).toBeDefined()
            expect(result?.label).toBe('Draft')
        })

        it('handles empty job status changes array', () => {
            const params = createTestParams('APPROVED', 'researcher', [])
            const result = useStudyStatus(params)

            expect(result?.label).toBe('Approved')
        })

        it('handles undefined status label gracefully', () => {
            const params = createTestParams('REJECTED', 'researcher')
            const result = useStudyStatus(params)

            expect(result).toBeDefined()
            expect(result?.label).toBe('Rejected')
        })
    })

    describe('status priority and ordering', () => {
        it('respects the reversed order of status keys for priority', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'RUN-COMPLETE' },
            ])
            const result = useStudyStatus(params)

            expect(result.stage).toBe('Results')
        })

        it('finds the first matching status in priority order, not chronological order', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-APPROVED' },
                { status: 'RUN-COMPLETE' },
            ])
            const result = useStudyStatus(params)

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

            expect(result?.label).toBe('Rejected')
        })
    })

    // OTTER-552: a resubmission opens a new job whose statuses carry a fresh CODE-SUBMITTED rather
    // than the prior round's decision.
    describe('code resubmission recency', () => {
        it('reviewer: resubmitted code after a change request reads "Needs Review", not "Change requested"', () => {
            const params = createTestParams('APPROVED', 'reviewer', [
                { status: 'CODE-SCANNED' },
                { status: 'CODE-SUBMITTED' },
            ])
            const result = useStudyStatus(params)

            expect(result.stage).toBe('Code')
            expect(result.label).toBe('Needs Review')
        })

        it('researcher: resubmitted code after a change request reads "Under Review"', () => {
            const params = createTestParams('APPROVED', 'researcher', [
                { status: 'CODE-SCANNED' },
                { status: 'CODE-SUBMITTED' },
            ])
            const result = useStudyStatus(params)

            expect(result.stage).toBe('Code')
            expect(result.label).toBe('Under Review')
        })

        it('still shows "Change requested" when no newer submission exists', () => {
            const params = createTestParams('APPROVED', 'reviewer', [
                { status: 'CODE-CHANGES-REQUESTED' },
                { status: 'CODE-SCANNED' },
                { status: 'CODE-SUBMITTED' },
            ])
            const result = useStudyStatus(params)

            expect(result.label).toBe('Change requested')
        })

        it('does not disturb the approved -> running flow (CODE-APPROVED stays)', () => {
            const params = createTestParams('APPROVED', 'reviewer', [
                { status: 'JOB-RUNNING' },
                { status: 'JOB-PACKAGING' },
                { status: 'CODE-APPROVED' },
                { status: 'CODE-SCANNED' },
                { status: 'CODE-SUBMITTED' },
            ])
            const result = useStudyStatus(params)

            expect(result.label).toBe('Processing')
        })
    })
})
