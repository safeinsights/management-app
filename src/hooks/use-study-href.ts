import { Routes } from '@/lib/routes'
import { StudyJobStatus, StudyStatus } from '@/database/types'

type StudyParams = { orgSlug: string; studyId: string }

export function useStudyHref(
    status: StudyStatus,
    hasJobActivity: boolean,
    studyParams: StudyParams,
    jobStatuses?: StudyJobStatus[],
) {
    // APPROVED with only a baseline job (no code submitted yet) → continue uploading
    const hasCodeSubmitted = jobStatuses?.some((s) => s === 'CODE-SUBMITTED')
    if (status === 'APPROVED' && hasJobActivity && !hasCodeSubmitted) return Routes.studyCode(studyParams)

    if (hasJobActivity) return Routes.studyView(studyParams)
    if (status === 'PENDING-REVIEW') return Routes.studySubmitted(studyParams)
    if (status === 'APPROVED') return Routes.studyAgreements(studyParams)
    return Routes.studyView(studyParams)
}
