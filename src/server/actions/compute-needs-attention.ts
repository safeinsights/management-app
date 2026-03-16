import { StudyJobStatus } from '@/database/types'

// Statuses that trigger attention for researchers (study owner)
const LAB_ATTENTION_STUDY_STATUSES = ['APPROVED', 'REJECTED'] as const
const LAB_ATTENTION_JOB_STATUSES = [
    'CODE-APPROVED',
    'CODE-REJECTED',
    'JOB-ERRORED',
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const

// Statuses that trigger attention for data org reviewers
const ENCLAVE_ATTENTION_STUDY_STATUSES = ['PENDING-REVIEW'] as const
const ENCLAVE_ATTENTION_JOB_STATUSES = ['CODE-SUBMITTED', 'JOB-ERRORED', 'RUN-COMPLETE'] as const

export type StudyWithJobChanges = {
    id: string
    status: string
    researcherId: string
    jobStatusChanges: Array<{ status: StudyJobStatus; userId?: string | null }>
}

export type ViewRecord = {
    studyId: string
    viewedAt: Date
}

export function computeNeedsAttention(
    study: StudyWithJobChanges,
    audience: 'researcher' | 'reviewer',
    viewRecord: ViewRecord | undefined,
    latestStatusChangeAt: Date | undefined,
): boolean {
    const latestJobStatus = study.jobStatusChanges[0]?.status

    const isAttentionStatus =
        audience === 'researcher'
            ? (LAB_ATTENTION_STUDY_STATUSES as readonly string[]).includes(study.status) ||
              (latestJobStatus && (LAB_ATTENTION_JOB_STATUSES as readonly string[]).includes(latestJobStatus))
            : (ENCLAVE_ATTENTION_STUDY_STATUSES as readonly string[]).includes(study.status) ||
              (latestJobStatus && (ENCLAVE_ATTENTION_JOB_STATUSES as readonly string[]).includes(latestJobStatus))

    if (!isAttentionStatus) return false

    // If never viewed, it needs attention
    if (!viewRecord) return true

    // If viewed before the latest status change, it needs attention again
    if (latestStatusChangeAt && viewRecord.viewedAt < latestStatusChangeAt) return true

    return false
}
