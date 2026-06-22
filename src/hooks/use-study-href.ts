import { Routes } from '@/lib/routes'
import { StudyJobStatus, StudyStatus } from '@/database/types'

type StudyParams = { orgSlug: string; studyId: string }

const POST_SUBMISSION_STATUSES: StudyStatus[] = ['PENDING-REVIEW', 'APPROVED', 'REJECTED', 'CHANGE-REQUESTED']

export function useStudyHref(
    status: StudyStatus,
    hasJobActivity: boolean,
    studyParams: StudyParams,
    jobStatuses?: StudyJobStatus[],
    agreementsAcked = false,
    hasCodeResubmissionDraft = false,
) {
    // OTTER-558: an in-progress code draft (saved, not yet resubmitted) resumes on the resubmit
    // page rather than the read-only post-decision view. Takes precedence over the rules below.
    if (hasCodeResubmissionDraft) return Routes.studyResubmit(studyParams)

    // APPROVED with only a baseline job (no code submitted yet) → continue uploading
    const hasCodeSubmitted = jobStatuses?.some((s) => s === 'CODE-SUBMITTED')
    if (status === 'APPROVED' && hasJobActivity && !hasCodeSubmitted) return Routes.studyCode(studyParams)

    if (hasJobActivity) return Routes.studyView(studyParams)

    if (status === 'APPROVED' && agreementsAcked) return Routes.studyCode(studyParams)

    if (POST_SUBMISSION_STATUSES.includes(status)) return Routes.studySubmitted(studyParams)

    return Routes.studyView(studyParams)
}
