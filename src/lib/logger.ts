import debug from 'debug'
import * as Sentry from '@sentry/nextjs'

// keep namespace‐based debug for debug/info
const debugWarn = debug('app:warn')
const debugError = debug('app:error')

const logger = {
    debug: debug('app:debug'),
    info: debug('app:info'),

    // always console.warn, then forward to Sentry only in prod
    warn: (...args: unknown[]) => {
        debugWarn(...args)
        console.warn(...args)
        if (process.env.NODE_ENV !== 'development') {
            try {
                const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
                Sentry.captureMessage(msg, 'warning')
            } catch (e) {
                console.warn('Failed to send warning to Sentry:', e)
            }
        }
    },

    // always console.error, then forward real Error or wrapped text in prod
    error: (...args: unknown[]) => {
        debugError(...args)
        console.error(...args)
        if (process.env.NODE_ENV !== 'development') {
            try {
                const real = args.find((a) => a instanceof Error) as Error | undefined
                if (real) {
                    Sentry.captureException(real)
                } else {
                    const msg = args.map(String).join(' ')
                    Sentry.captureException(new Error(msg))
                }
            } catch (e) {
                console.error('Failed to send exception to Sentry:', e)
            }
        }
    },
}

// Enable debug output in development
if (process.env.NODE_ENV === 'development') {
    debug.enable('app:*')
}

export default logger
