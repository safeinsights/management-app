import type { Language } from '@/database/types'

export interface ResubmitStudyData {
    id: string
    orgSlug: string
    submittedByOrgSlug: string
    language: Language
}

export interface ResubmitCodeContextValue {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    language: Language
}
