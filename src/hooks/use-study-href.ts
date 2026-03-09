import { Routes } from '@/lib/routes'
import { StudyStatus } from '@/database/types'

type StudyParams = { orgSlug: string; studyId: string }

export function useStudyHref(status: StudyStatus, hasJobActivity: boolean, studyParams: StudyParams) {
    if (hasJobActivity) return Routes.studyView(studyParams)
    if (status === 'PENDING-REVIEW') return Routes.studySubmitted(studyParams)
    if (status === 'APPROVED') return Routes.studyAgreements(studyParams)
    return Routes.studyView(studyParams)
}
