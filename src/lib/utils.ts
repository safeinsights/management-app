import { errorToString, isActionError, type ActionResponse } from '@/lib/errors'
import * as Sentry from '@sentry/nextjs'
import { createHash } from 'crypto'
import { UserSession } from './types'

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

export const labOrgIds = (session: UserSession) =>
    Object.values(session.orgs)
        .filter((org) => org.type === 'lab')
        .map((org) => org.id)

export const enclaveOrgIds = (session: UserSession) =>
    Object.values(session.orgs)
        .filter((org) => org.type === 'enclave')
        .map((org) => org.id)

export function actionResult<T>(result: ActionResponse<T>): T {
    if (isActionError(result)) {
        throw new Error(errorToString(result))
    }
    return result
}

export function uuidToStr(uuid: string, hash: boolean, length?: number) {
    if (!uuid) return ''
    let result = uuid.replaceAll(/[^a-z0-9]/gi, '').toLowerCase()
    if (hash) result = shaHash(result)
    return length ? result.substring(0, length) : result
}

export function shaHash(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}
