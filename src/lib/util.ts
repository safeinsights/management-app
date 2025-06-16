import * as Sentry from '@sentry/nextjs'
import { z, ZodIssueCode } from 'zod'
type TimeOpts = { [key: number]: 'ms' } | { [key: number]: 'seconds' } | { [key: number]: 'minutes' }

export async function sleep(opts: TimeOpts): Promise<void> {
    let ms = 0
    for (const [key, unit] of Object.entries(opts)) {
        const duration = parseInt(key, 10)
        if (unit === 'ms') {
            ms += duration
        } else if (unit === 'seconds') {
            ms += duration * 1000
        } else if (unit === 'minutes') {
            ms += duration * 60 * 1000
        }
    }
    return new Promise<void>((resolve, reject) => {
        try {
            setTimeout(resolve, ms)
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


export function strToZod(value: unnknown, ctx: z.RefinementCtx) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message: (e as Error).message,
            });
        }
    }

    return value;
};
