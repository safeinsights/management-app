import { Routes } from '@/lib/routes'
import { StudyStatus } from '@/database/types'

type StudyParams = { orgSlug: string; studyId: string }

export function useStudyHref(status: StudyStatus, hasJobActivity: boolean, studyParams: StudyParams) {
    if (status === 'PENDING-REVIEW') return Routes.studySubmitted(studyParams)
    if (status === 'APPROVED' && !hasJobActivity) return Routes.studyAgreements(studyParams)
    return Routes.studyView(studyParams)
}
