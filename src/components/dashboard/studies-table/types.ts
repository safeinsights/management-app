import type React from 'react'
import { Json, StudyJobStatus, StudyStatus } from '@/database/types'

export type Audience = 'researcher' | 'reviewer'
export type Scope = 'org' | 'user'

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
    // Used to resume a reopened DRAFT on the step it was last left (OTTER-572).
    piUserId: string | null
    datasets: string[] | null
    researchQuestions: Json | null
    projectSummary: Json | null
    impact: Json | null
    additionalNotes: Json | null
    // Same purpose, for Step 2 edits living only in Yjs because no flush wrote the columns.
    hasStep2CollabDoc: boolean
    reviewingEnclaveName?: string
    submittingLabName?: string
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

export const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const ACTIVE_PROPOSAL_STATUSES: StudyStatus[] = ['PENDING-REVIEW']

export const REVIEWER_ACTION_STATUSES: StudyJobStatus[] = [
    'CODE-APPROVED',
    'CODE-REJECTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
]
