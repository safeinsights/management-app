import type { StudyJobStatus } from '@/database/types'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'

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

    if (!study.submittedAt) {
        throw new Error('submittedAt is required for proposal header timestamp')
    }
    return study.submittedAt
}
