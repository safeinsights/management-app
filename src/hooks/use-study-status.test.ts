import { StudyJobStatus, StudyStatus } from '@/database/types'
import { describe, expect, it } from 'vitest'
import { useStudyStatus, UseStudyStatusParams } from './use-study-status'

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }

const params = (
    studyStatus: StudyStatus,
    audience: 'reviewer' | 'researcher',
    jobStatusChanges: Array<{ status: StudyJobStatus }> = [],
): UseStudyStatusParams => ({ studyStatus, audience, jobStatusChanges, names: NAMES })

describe('useStudyStatus', () => {
    it('reads the study status when the study has no jobs', () => {
        expect(useStudyStatus(params('PENDING-REVIEW', 'researcher'))).toMatchObject({
            id: 'proposal-submitted',
            label: 'Proposal submitted',
            tooltip: 'Waiting for Openstax to review proposal.',
        })
    })

    it('lets the job phase outrank the study status', () => {
        const result = useStudyStatus(
            params('APPROVED', 'researcher', [
                { status: 'CODE-SUBMITTED' },
                { status: 'CODE-APPROVED' },
                { status: 'RUN-COMPLETE' },
            ]),
        )
        expect(result.id).toBe('outputs-awaiting')
    })

    it('gives the two audiences different labels for the same study', () => {
        const changes: Array<{ status: StudyJobStatus }> = [{ status: 'CODE-SUBMITTED' }]
        expect(useStudyStatus(params('APPROVED', 'researcher', changes)).label).toBe('Code submitted')
        expect(useStudyStatus(params('APPROVED', 'reviewer', changes)).label).toBe('Code needs review')
    })

    // OTTER-598: the researcher must not learn a run failed before the reviewer has triaged it.
    describe('error disclosure', () => {
        const errored: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'JOB-ERRORED' },
        ]

        it('hides the failure from the researcher until a decision exists', () => {
            expect(useStudyStatus(params('APPROVED', 'researcher', errored)).label).toBe('Awaiting outputs')
        })

        it('shows the failure to the researcher once the reviewer shares a decision', () => {
            const decided = [...errored, { status: 'FILES-APPROVED' as StudyJobStatus }]
            expect(useStudyStatus(params('APPROVED', 'researcher', decided)).label).toBe('Code errored')
        })

        it('shows the failure to the reviewer immediately', () => {
            expect(useStudyStatus(params('APPROVED', 'reviewer', errored)).label).toBe('Code errored')
        })
    })

    // OTTER-641: a resubmission must clear the previous round's decision from the pill.
    it('reads a resubmission as under review, not as the previous change request', () => {
        const resubmitted: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-CHANGES-REQUESTED' },
            { status: 'CODE-SUBMITTED' },
        ]
        expect(useStudyStatus(params('APPROVED', 'reviewer', resubmitted)).label).toBe('Code needs review')
        expect(useStudyStatus(params('APPROVED', 'researcher', resubmitted)).label).toBe('Code submitted')
    })

    it('still reads a change request when no newer submission exists', () => {
        const changes: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-CHANGES-REQUESTED' },
        ]
        expect(useStudyStatus(params('APPROVED', 'researcher', changes)).label).toBe('Code needs revision')
        expect(useStudyStatus(params('APPROVED', 'reviewer', changes)).label).toBe('Code revision requested')
    })

    it('reads the furthest enclave stage for the reviewer and one processing label for the researcher', () => {
        const running: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'JOB-PACKAGING' },
            { status: 'JOB-READY' },
            { status: 'JOB-PROVISIONING' },
        ]
        expect(useStudyStatus(params('APPROVED', 'reviewer', running)).label).toBe('Code queued')
        expect(useStudyStatus(params('APPROVED', 'researcher', running)).label).toBe('Code processing')
    })

    // OTTER-698: the only pill fact the lifecycle statuses cannot carry, so RESULTS-VIEWED records it.
    describe('outputs decision', () => {
        const decided: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'RUN-COMPLETE' },
            { status: 'FILES-APPROVED' },
        ]

        it('reads as needing review until the researcher opens it', () => {
            expect(useStudyStatus(params('APPROVED', 'researcher', decided)).label).toBe('Outputs need review')
        })

        it('reads as reviewed once the researcher has opened it', () => {
            const viewed = [...decided, { status: 'RESULTS-VIEWED' as StudyJobStatus }]
            const result = useStudyStatus(params('APPROVED', 'researcher', viewed))
            expect(result.label).toBe('Outputs reviewed')
            expect(result.tooltip).toBe(
                'You have reviewed the decision on your outputs. You can resubmit code if needed.',
            )
        })

        it('reads as reviewed to the reviewer, who made the decision', () => {
            const result = useStudyStatus(params('APPROVED', 'reviewer', decided))
            expect(result.label).toBe('Outputs reviewed')
            expect(result.tooltip).toBe('A decision on the outputs has been shared with Openstax Lab.')
        })
    })

    it('falls back to a draft pill for a study with no status the rules claim', () => {
        expect(useStudyStatus(params('ARCHIVED', 'researcher')).label).toBe('Proposal draft')
    })
})
