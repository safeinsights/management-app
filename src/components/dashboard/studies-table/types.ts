import { Json, StudyJobStatus, StudyStatus } from '@/database/types'
import type { StudyRole } from '@/lib/study-screen/state.types'

export type Audience = StudyRole
export type Scope = 'org' | 'user'

export type StudyRow = {
    id: string
    title: string | null
    status: StudyStatus
    createdAt: Date
    submittedAt: Date | null
    approvedAt?: Date | null
    rejectedAt?: Date | null
    lastUpdatedAt: Date
    reviewerName: string | null
    researcherId: string
    reviewerId: string | null
    createdBy: string | null // researcher.fullName
    // createdAt arrives as an ISO string: the history is built with jsonArrayFrom.
    jobStatusChanges: Array<{ status: StudyJobStatus; userId?: string | null; createdAt?: Date | string }>
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
    // Dashboard-only fields (OTTER-617), filled by the three dashboard actions.
    ownEditsAt?: Date | null
    proposalAuditName?: string | null
    proposalAuditAt?: Date | null
    proposalResubmitterName?: string | null
    proposalResubmittedAt?: Date | null
    codeSubmitterName?: string | null
    codeSubmittedAt?: Date | null
    proposalReviewerName?: string | null
    proposalReviewedAt?: Date | null
    codeReviewerName?: string | null
    codeReviewedAt?: Date | null
    outputsReviewerName?: string | null
    outputsReviewedAt?: Date | null
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

export const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const ACTIVE_PROPOSAL_STATUSES: StudyStatus[] = ['PENDING-REVIEW']
