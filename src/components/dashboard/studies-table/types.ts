import type React from 'react'
import { Json, StudyJobStatus, StudyStatus } from '@/database/types'

export type Audience = 'researcher' | 'reviewer'
export type Scope = 'org' | 'user'

// Unified study type that works with all server actions
export type StudyRow = {
    id: string
    title: string
    status: StudyStatus
    createdAt: Date
    submittedAt: Date | null
    lastUpdatedAt: Date
    reviewerName: string | null
    researcherId: string
    reviewerId: string | null
    createdBy: string | null // researcher.fullName
    jobStatusChanges: Array<{ status: StudyJobStatus; userId?: string | null }>
    researcherAgreementsAckedAt: Date | null
    // OTTER-636: drives the researcher's "Proposal draft" pill while a change-requested proposal is revised.
    proposalEditedAt: Date | null
    // Step 2 proposal fields — used to resume a reopened DRAFT on the step it was last left (OTTER-572).
    piUserId: string | null
    datasets: string[] | null
    researchQuestions: Json | null
    projectSummary: Json | null
    impact: Json | null
    additionalNotes: Json | null
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
    headerActions?: React.ReactNode
}

// Status changes that indicate job is in a final state (no refresh needed)
export const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

// Proposal statuses where the researcher is awaiting a DO decision — keep auto-refresh polling.
export const ACTIVE_PROPOSAL_STATUSES: StudyStatus[] = ['PENDING-REVIEW']

// Status changes that represent reviewer approval/rejection actions (for filtering user's reviewed studies)
export const REVIEWER_ACTION_STATUSES: StudyJobStatus[] = [
    'CODE-APPROVED',
    'CODE-REJECTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
]
