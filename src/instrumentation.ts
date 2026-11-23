import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'
import { isActionResultError } from '@/lib/errors'

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config')
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config')
    }
}

// The action already logged an expected failure once; a page re-throwing it via actionResult is
// not a second bug (OTTER-842).
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
    if (isActionResultError(error)) return
    return Sentry.captureRequestError(error, request, context)
}
