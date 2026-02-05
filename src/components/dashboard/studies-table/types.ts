import { StudyJobStatus, StudyStatus } from '@/database/types'

export type Audience = 'researcher' | 'reviewer'
export type Scope = 'org' | 'user'

// Unified study type that works with all server actions
export type StudyRow = {
    id: string
    title: string
    status: StudyStatus
    createdAt: Date
    researcherId: string
    reviewerId: string | null
    createdBy: string | null // researcher.fullName
    jobStatusChanges: Array<{ status: StudyJobStatus; userId?: string | null }>
    // Org actions return these
    reviewingEnclaveName?: string
    submittingLabName?: string
    // User actions return these
    orgName?: string
    orgSlug?: string
    submittedByOrgSlug?: string
}

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

// Status changes that indicate job is in a final state (no refresh needed)
export const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

// Status changes that represent reviewer approval/rejection actions (for filtering user's reviewed studies)
export const REVIEWER_ACTION_STATUSES: StudyJobStatus[] = [
    'CODE-APPROVED',
    'CODE-REJECTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
]
