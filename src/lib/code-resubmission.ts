import type { StudyJobStatus } from '@/database/types'

export const CODE_RESUBMITTABLE_JOB_STATUSES = [
    'CODE-CHANGES-REQUESTED',
    'JOB-ERRORED',
    'RUN-COMPLETE',
    'FILES-REJECTED',
] as const satisfies readonly StudyJobStatus[]

const codeResubmittableJobStatusSet = new Set<StudyJobStatus>(CODE_RESUBMITTABLE_JOB_STATUSES)

export function canResubmitStudyCode(status: string | null | undefined): status is StudyJobStatus {
    return codeResubmittableJobStatusSet.has(status as StudyJobStatus)
}
