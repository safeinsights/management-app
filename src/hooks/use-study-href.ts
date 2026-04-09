import { Routes } from '@/lib/routes'
import { StudyStatus } from '@/database/types'

type StudyParams = { orgSlug: string; studyId: string }

export function useStudyHref(status: StudyStatus, hasJobActivity: boolean, studyParams: StudyParams) {
    if (status === 'APPROVED' && hasJobActivity) return Routes.studyCode(studyParams)
    if (hasJobActivity || status === 'PENDING-REVIEW') return Routes.studyView(studyParams)
    if (status === 'APPROVED') return Routes.studyAgreements(studyParams)
    return Routes.studyView(studyParams)
}
