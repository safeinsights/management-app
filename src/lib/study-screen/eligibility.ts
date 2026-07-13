import type { StudyState } from './state.types'

// Resubmit eligibility as projected facts, replacing the retired CODE_RESUBMITTABLE_JOB_STATUSES
// predicate (CODE-CHANGES-REQUESTED / FILES-APPROVED / FILES-REJECTED). Sourcing it from the
// projection makes it order-independent (statuses are a Set, latest job by max(id)) AND liveness-aware:
// codeDecision drops a stale CODE-CHANGES-REQUESTED once a fresh CODE-SUBMITTED is appended, so a study
// already resubmitted and awaiting a new decision is not offered another resubmit.
//
// Invariant that makes "any resubmittable fact present" equal "the latest decision is resubmittable":
// FILES-APPROVED/FILES-REJECTED are round-closing (a resubmit opens a NEW job) and CODE-REJECTED is
// terminal, so within a single job a resubmittable status is never followed on that same job by a
// revoking one.
export const canResearcherResubmitCode = (s: StudyState): boolean =>
    s.codeDecision === 'CODE-CHANGES-REQUESTED' || s.resultsApproved || s.resultsRejected
