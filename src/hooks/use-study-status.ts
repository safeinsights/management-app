import { StudyJobStatus, StudyStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, StatusLabel } from '@/lib/status-labels'
import { AllStatus } from '@/lib/types'

export type MinimalStatusChange = {
    status: StudyJobStatus
}

export type UseStudyStatusParams = {
    studyStatus: StudyStatus
    audience: 'reviewer' | 'researcher'
    jobStatusChanges: MinimalStatusChange[]
}

export type UseStudyStatusReturn = {
    statusLabel: StatusLabel | null
    displayedStatus: AllStatus | null
}

// note: the order of keys matters here and is reversed from
// the order in the status label definitions.
// this ensures that statuses are searched from the end
const STATUS_KEYS: Record<'reviewer' | 'researcher', AllStatus[]> = {
    reviewer: Object.keys(REVIEWER_STATUS_LABELS).reverse() as AllStatus[],
    researcher: Object.keys(RESEARCHER_STATUS_LABELS).reverse() as AllStatus[],
}

const LABELS: Record<'reviewer' | 'researcher', Partial<Record<AllStatus, StatusLabel>>> = {
    reviewer: REVIEWER_STATUS_LABELS,
    researcher: RESEARCHER_STATUS_LABELS,
}

// A code resubmission appends a fresh CODE-SUBMITTED (then CODE-SCANNED) after the prior
// round's CODE-CHANGES-REQUESTED. The pill is priority-set based and ignores recency, so
// the stale CODE-CHANGES-REQUESTED would otherwise outrank the newer submission and the
// study would read "Change requested" when its code is actually awaiting a fresh review.
// When a (re)submission is newer than the latest code decision, drop the stale decision
// statuses so the submission drives the Code-stage label. jobStatusChanges is newest-first.
const CODE_DECISION_STATUSES: StudyJobStatus[] = ['CODE-CHANGES-REQUESTED', 'CODE-REJECTED', 'CODE-APPROVED']
const CODE_SUBMISSION_STATUSES: StudyJobStatus[] = ['CODE-SUBMITTED', 'CODE-SCANNED']

const dropStaleCodeDecisions = (changes: MinimalStatusChange[]): MinimalStatusChange[] => {
    const newestSubmissionIdx = changes.findIndex((c) => CODE_SUBMISSION_STATUSES.includes(c.status))
    const newestDecisionIdx = changes.findIndex((c) => CODE_DECISION_STATUSES.includes(c.status))
    const submissionIsNewer =
        newestSubmissionIdx !== -1 && (newestDecisionIdx === -1 || newestSubmissionIdx < newestDecisionIdx)
    if (!submissionIsNewer) return changes
    return changes.filter((c) => !CODE_DECISION_STATUSES.includes(c.status))
}

export const useStudyStatus = ({ studyStatus, audience, jobStatusChanges }: UseStudyStatusParams): StatusLabel => {
    // Researchers must not see "Errored" until the reviewer has reviewed the error logs
    // and recorded a FILES-APPROVED/FILES-REJECTED decision. Until then, hide JOB-ERRORED
    // so the pill falls back to the prior state (typically CODE-APPROVED). Reviewers
    // always see JOB-ERRORED immediately so they can act on the logs.
    const hasReviewerDecision = jobStatusChanges.some(
        (c) => c.status === 'FILES-APPROVED' || c.status === 'FILES-REJECTED',
    )
    const recencyAdjusted = dropStaleCodeDecisions(jobStatusChanges)
    const visibleJobChanges =
        audience === 'researcher' && !hasReviewerDecision
            ? recencyAdjusted.filter((c) => c.status !== 'JOB-ERRORED')
            : recencyAdjusted

    // add studyStatus as the last entry as a fallback in case a job hasn't started yet
    const statuses: AllStatus[] = [...visibleJobChanges.map((change) => change.status), studyStatus]

    const statusKeys = STATUS_KEYS[audience]
    const labels = LABELS[audience]

    // JOB-ERRORED always takes precedence if present (after any researcher-specific filtering above)
    if (statuses.includes('JOB-ERRORED')) {
        return labels['JOB-ERRORED']!
    }

    const displayedStatus = statusKeys.find((statusKey) => {
        return statuses.find((status) => status === statusKey)
    })

    if (!displayedStatus) {
        return labels['DRAFT']!
    }

    const statusLabel = labels[displayedStatus as AllStatus]!

    return statusLabel
}
