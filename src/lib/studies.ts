import type { Route } from 'next'
import type { StudyJobStatus } from '@/database/types'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { DraftStep2Fields } from '@/lib/study-screen/state.types'
import { effectiveProposalStatus } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'

type StudyWithJobStatuses = {
    jobStatusChanges: Array<{ status: StudyJobStatus }>
}

export function studyHasJobStatus(study: StudyWithJobStatuses, status: StudyJobStatus): boolean {
    return study.jobStatusChanges.some((s) => s.status === status)
}

// Once code is submitted this must be the read-only code view, NOT plain /view, which would jump
// an advanced study straight to results (OTTER-727).
export function researcherCodeStepHref(
    study: StudyWithJobStatuses & { id: string },
    { orgSlug, returnTo }: { orgSlug: string; returnTo?: string },
): Route {
    if (studyHasJobStatus(study, 'CODE-SUBMITTED')) {
        return Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo })
    }
    return Routes.studyCode({ orgSlug, studyId: study.id })
}

export function deriveStudyVersion(entries: { version: number }[]): number {
    if (entries.length === 0) return 1
    return Math.max(...entries.map((e) => e.version))
}

// Step 2 is the first time any of these columns is written, so one being non-empty means the
// researcher reached it.
export function draftHasStep2Progress(study: DraftStep2Fields): boolean {
    if (study.piUserId) return true
    if (study.datasets && study.datasets.length > 0) return true
    if (study.researchQuestions != null) return true
    if (study.projectSummary != null) return true
    if (study.impact != null) return true
    if (study.additionalNotes != null) return true
    return false
}

export function decisionTimestampForProposalHeader(study: SelectedStudy, entries: ProposalFeedbackEntry[]): Date {
    const status = effectiveProposalStatus(study)
    if (status === 'APPROVED' && study.approvedAt) {
        return study.approvedAt
    }
    if (status === 'REJECTED' && study.rejectedAt) {
        return study.rejectedAt
    }
    if (status === 'CHANGE-REQUESTED' && entries.length > 0) {
        // entries are ordered by createdAt descending
        const latestClarification = entries.find((e) => e.decision === 'NEEDS-CLARIFICATION')
        if (latestClarification) return latestClarification.createdAt
    }
    if (status === 'PENDING-REVIEW' && entries.length > 0) {
        const latestResubmission = entries.find((e) => e.entryType === 'RESUBMISSION-NOTE')
        if (latestResubmission) return latestResubmission.createdAt
    }

    if (!study.submittedAt) {
        throw new Error('submittedAt is required for proposal header timestamp')
    }
    return study.submittedAt
}
