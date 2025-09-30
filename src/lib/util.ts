import * as Sentry from '@sentry/nextjs'
import { StudyStage } from './types'

export type TimeOpts =
    | { [key: number]: 'ms' }
    | { 1: 'second' }
    | { [key: number]: 'seconds' }
    | { 1: 'minute' }
    | { [key: number]: 'minutes' }

export function timeOptsToMS(opts: TimeOpts) {
    let ms = 0
    for (const [key, unit] of Object.entries(opts)) {
        const duration = parseInt(key, 10)
        if (unit === 'ms') {
            ms += duration
        } else if (unit.startsWith('second')) {
            ms += duration * 1000
        } else if (unit.startsWith('minute')) {
            ms += duration * 60 * 1000
        }
    }
    return ms
}

export async function sleep(opts: TimeOpts): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        try {
            setTimeout(resolve, timeOptsToMS(opts))
        } catch (error) {
            Sentry.captureException(error)
            reject(error)
        }
    })
}

export function sanitizeFileName(fileName: string) {
    return fileName
        .substring(0, 512) // max path + filename length
        .replace(/^\/+/, '') // leading slashes
        .replace(/\.\./g, '') // no directory traversal with ..
        .replace(/[^\x00-\x7F]/g, '') // non-ascii
}

// helper function to get the stage based on status and audience
export function getStudyStage(status: string, audience: 'researcher' | 'reviewer'): StudyStage {
    const normalizedStatus = status.toLowerCase().replace(/_/g, '-')

    if (normalizedStatus.includes('results-')) {
        return 'Results'
    }

    if (audience === 'researcher') {
        if (['approved', 'code-approved', 'job-errored'].includes(normalizedStatus)) {
            return 'Code'
        }
    } else {
        if (normalizedStatus.startsWith('job-') || ['approved', 'code-approved'].includes(normalizedStatus)) {
            return 'Code'
        }
    }

    return 'Proposal'
}
