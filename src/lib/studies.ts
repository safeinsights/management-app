import type { StudyJobStatus } from '@/database/types'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { DraftStep2Fields } from '@/lib/study-screen/state.types'

type StudyWithJobStatuses = {
    jobStatusChanges: Array<{ status: StudyJobStatus }>
}

export function studyHasJobStatus(study: StudyWithJobStatuses, status: StudyJobStatus): boolean {
    return study.jobStatusChanges.some((s) => s.status === status)
}

export function deriveStudyVersion(entries: { version: number }[]): number {
    if (entries.length === 0) return 1
    return Math.max(...entries.map((e) => e.version))
}

// Step 1 (data org + language + docs) saves `orgSlug`, `language`, `title`,
// `piName`, and document paths. Step 2 is the first time any of the columns
// below are written, so any one being non-empty means the researcher has
// reached Step 2. Used to route a "resume draft" entry to the step where
// they last left off instead of always landing on Step 1. Step 1 never writes these columns
export function draftHasStep2Progress(study: DraftStep2Fields): boolean {
    if (study.piUserId) return true
    if (study.datasets && study.datasets.length > 0) return true
    if (study.researchQuestions != null) return true
    if (study.projectSummary != null) return true
    if (study.impact != null) return true
    if (study.additionalNotes != null) return true
    return false
}

/** Returns the timestamp of the latest decision for the submitted proposal header. */
export function decisionTimestampForProposalHeader(study: SelectedStudy, entries: ProposalFeedbackEntry[]): Date {
    if (study.status === 'APPROVED' && study.approvedAt) {
        return study.approvedAt
    }
    if (study.status === 'REJECTED' && study.rejectedAt) {
        return study.rejectedAt
    }
    if (study.status === 'CHANGE-REQUESTED' && entries.length > 0) {
        // entries are ordered by createdAt descending
        const latestClarification = entries.find((e) => e.decision === 'NEEDS-CLARIFICATION')
        if (latestClarification) return latestClarification.createdAt
    }
    if (study.status === 'PENDING-REVIEW' && entries.length > 0) {
        // source the resubmission date from the latest RESUBMISSION-NOTE entry.
        const latestResubmission = entries.find((e) => e.entryType === 'RESUBMISSION-NOTE')
        if (latestResubmission) return latestResubmission.createdAt
    }

    if (!study.submittedAt) {
        throw new Error('submittedAt is required for proposal header timestamp')
    }
    return study.submittedAt
}
