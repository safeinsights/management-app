import { StudyJobStatus, StudyStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, StatusLabel } from '@/lib/status-labels'
import { AllStatus } from '@/lib/types'

export type MinimalStatusChange = {
    status: StudyJobStatus
}

export type UseStudyStatusParams = {
    studyStatus: StudyStatus
    audience: 'reviewer' | 'researcher'
    jobStatusChanges: MinimalStatusChange[]
}

export type UseStudyStatusReturn = {
    statusLabel: StatusLabel | null
    displayedStatus: AllStatus | null
}

// note: the order of keys matters here and is reversed from
// the order in the status label definitions.
// this ensures that statuses are searched from the end
const STATUS_KEYS: Record<'reviewer' | 'researcher', AllStatus[]> = {
    reviewer: Object.keys(REVIEWER_STATUS_LABELS).reverse() as AllStatus[],
    researcher: Object.keys(RESEARCHER_STATUS_LABELS).reverse() as AllStatus[],
}

const LABELS: Record<'reviewer' | 'researcher', Partial<Record<AllStatus, StatusLabel>>> = {
    reviewer: REVIEWER_STATUS_LABELS,
    researcher: RESEARCHER_STATUS_LABELS,
}

export const useStudyStatus = ({ studyStatus, audience, jobStatusChanges }: UseStudyStatusParams): StatusLabel => {
    // add studyStatus as the last entry as a fallback in case a job hasn't started yet
    const statuses: AllStatus[] = [...jobStatusChanges.map((change) => change.status), studyStatus]

    const statusKeys = STATUS_KEYS[audience]
    const labels = LABELS[audience]

    // JOB-ERRORED always takes precedence if present
    if (statuses.includes('JOB-ERRORED')) {
        return labels['JOB-ERRORED']!
    }

    const displayedStatus = statusKeys.find((statusKey) => {
        return statuses.find((status) => status === statusKey)
    })

    if (!displayedStatus) {
        return labels['DRAFT']!
    }

    const statusLabel = labels[displayedStatus as AllStatus]!

    return statusLabel
}
