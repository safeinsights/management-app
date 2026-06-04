import type { StudyJobStatus } from '@/database/types'

// CODE-REJECTED is terminal: a rejected study allows no resubmission, only a brand-new
// proposal. Only CODE-CHANGES-REQUESTED permits resubmitting the code for the same study.
export const CODE_RESUBMITTABLE_JOB_STATUSES = [
    'CODE-CHANGES-REQUESTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
    'RUN-COMPLETE',
] as const satisfies readonly StudyJobStatus[]

const codeResubmittableJobStatusSet = new Set<StudyJobStatus>(CODE_RESUBMITTABLE_JOB_STATUSES)

export function canResubmitStudyCode(status: string | null | undefined): status is StudyJobStatus {
    return codeResubmittableJobStatusSet.has(status as StudyJobStatus)
}
