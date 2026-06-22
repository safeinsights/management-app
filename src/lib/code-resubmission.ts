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

// A round CLOSES — and the next IDE launch / upload / submit opens a NEW studyJob — only after a
// post-run results decision. Pre-run outcomes (CODE-CHANGES-REQUESTED) and a not-yet-reviewed errored
// run (JOB-ERRORED, awaiting the reviewer's files decision) revise/continue the SAME job.
// CODE-REJECTED is terminal. This is DISTINCT from CODE_RESUBMITTABLE_JOB_STATUSES (resubmit eligibility).
export const ROUND_CLOSING_JOB_STATUSES = [
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const satisfies readonly StudyJobStatus[]

const codeResubmittableJobStatusSet = new Set<StudyJobStatus>(CODE_RESUBMITTABLE_JOB_STATUSES)

export function canResubmitStudyCode(status: string | null | undefined): status is StudyJobStatus {
    return codeResubmittableJobStatusSet.has(status as StudyJobStatus)
}
