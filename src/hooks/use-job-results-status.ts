import { type StudyJobStatus } from '@/database/types'
import { useMemo } from 'react'

type StatusFlags = {
    isApproved: boolean
    isRejected: boolean
    isFilesRejected: boolean
    isCodeRejected: boolean
    isComplete: boolean
    isErrored: boolean
}

export type StatusChange = {
    status: StudyJobStatus
    message?: string | null
}

export const StatusMap: Partial<Record<StudyJobStatus, keyof StatusFlags>> = {
    'FILES-APPROVED': 'isApproved',
    'FILES-REJECTED': 'isFilesRejected',
    'CODE-REJECTED': 'isCodeRejected',
    'RUN-COMPLETE': 'isComplete',
    'JOB-ERRORED': 'isErrored',
}

const initialFlags: StatusFlags = {
    isApproved: false,
    isRejected: false,
    isComplete: false,
    isErrored: false,
    isCodeRejected: false,
    isFilesRejected: false,
}

export function extractJobStatus(statusChanges: StatusChange[]): StatusFlags {
    const results = statusChanges.reduce(
        (acc, sc) => {
            const key = StatusMap[sc.status]
            if (key) acc[key] = true
            return acc
        },
        { ...initialFlags },
    )
    return { ...results, isRejected: results.isCodeRejected || results.isFilesRejected }
}

export function useJobStatus(statusChanges: StatusChange[]): StatusFlags {
    return useMemo(() => extractJobStatus(statusChanges), [statusChanges])
}
