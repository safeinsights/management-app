import type { StudyJobStatus } from '@/database/types'

type StudyWithJobStatuses = {
    jobStatusChanges: Array<{ status: StudyJobStatus }>
}

export function studyHasJobStatus(study: StudyWithJobStatuses, status: StudyJobStatus): boolean {
    return study.jobStatusChanges.some((s) => s.status === status)
}
