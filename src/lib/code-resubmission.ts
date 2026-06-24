import type { StudyJobStatus } from '@/database/types'

// Resubmit eligibility. These are exactly the states where the researcher is offered a resubmit
// affordance in the UI (OTTER-558's "code change requested", "results ready", "results rejected"):
//   - CODE-CHANGES-REQUESTED — revise in place; the round is still open (an undecided submission).
//   - FILES-APPROVED / FILES-REJECTED — round-closing; a resubmit opens a NEW round job.
// Bare RUN-COMPLETE / JOB-ERRORED are deliberately NOT here. They await the reviewer's files decision
// and are written on the SAME job the FILES-* decision later closes — they neither close a round nor
// carry an undecided submission, so a resubmit from them would reuse the job and markCodeSubmitted
// would no-op (silently dropping the submission). The UI never offers resubmit at those bare states
// (the "results ready"/errored resubmit buttons render only once FILES-APPROVED is present); allowing
// them only via direct URL was the silent-drop bug. CODE-REJECTED is terminal: no resubmission, only
// a brand-new proposal.
export const CODE_RESUBMITTABLE_JOB_STATUSES = [
    'CODE-CHANGES-REQUESTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
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
