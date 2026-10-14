import { StudyJobStatus, StudyStatus } from '@/database/types'
import type { StudyRole } from '@/lib/study-screen/state.types'

export type { StudyRow } from '@/lib/study-screen/dashboard-row.types'

export type Audience = StudyRole
export type Scope = 'org' | 'user'

export type StudiesTableProps = {
    audience: Audience
    scope: Scope
    orgSlug: string
    title?: string
    description?: string
    showNewStudyButton?: boolean
    showRefresher?: boolean
    paperWrapper?: boolean
}

export const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const ACTIVE_PROPOSAL_STATUSES: StudyStatus[] = ['PENDING-REVIEW']
