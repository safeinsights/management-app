import { type StudyJobStatus } from '@/database/types'
import { useMemo } from 'react'

type StatusFlags = {
    isApproved: boolean
    isRejected: boolean
    isComplete: boolean
    isErrored: boolean
}

export type StatusChange = {
    status: StudyJobStatus
}

export const StatusMap: Partial<Record<StudyJobStatus, keyof StatusFlags>> = {
    'FILES-APPROVED': 'isApproved',
    'FILES-REJECTED': 'isRejected',
    'CODE-REJECTED': 'isRejected',
    'RUN-COMPLETE': 'isComplete',
    'JOB-ERRORED': 'isErrored',
}

const initialFlags: StatusFlags = {
    isApproved: false,
    isRejected: false,
    isComplete: false,
    isErrored: false,
}

export function useJobResultsStatus(statusChanges: StatusChange[]): StatusFlags {
    return useMemo(() => {
        return statusChanges.reduce(
            (acc, sc) => {
                const key = StatusMap[sc.status]
                if (key) acc[key] = true
                return acc
            },
            { ...initialFlags },
        )
    }, [statusChanges])
}
