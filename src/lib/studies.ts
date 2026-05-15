import type { StudyJobStatus } from '@/database/types'

type StudyWithJobStatuses = {
    jobStatusChanges: Array<{ status: StudyJobStatus }>
}

export function studyHasJobStatus(study: StudyWithJobStatuses, status: StudyJobStatus): boolean {
    return study.jobStatusChanges.some((s) => s.status === status)
}

export function deriveStudyVersion(entries: { version: number }[]): number {
    if (entries.length === 0) return 1
    return Math.max(...entries.map((e) => e.version))
}
