import debug from 'debug'
import * as Sentry from '@sentry/nextjs'
import type { SeverityLevel } from '@sentry/nextjs'
import { inspect } from 'util'

// map our log levels to the right console method
const consoleMethodMap = {
    warn: console.warn,
    error: console.error,
} as const

// map our log levels to Sentry severities
const sentrySeverityMap: Record<'warn' | 'error', SeverityLevel> = {
    warn: 'warning',
    error: 'error',
}

// keep namespace‐based debug for debug/info
const debugWarn = debug('app:warn')
const debugError = debug('app:error')

function pretty(a: unknown): string {
    if (a === null) return 'null'
    if (a === undefined) return 'undefined'
    if (typeof a === 'function') {
        return `[Function${a.name ? `: ${a.name}` : ''}]`
    }
    if (a instanceof Error) {
        return a.stack ?? a.message
    }
    if (typeof a === 'object') {
        try {
            return JSON.stringify(a)
        } catch {
            // fallback: pretty-print circular or deep objects with util.inspect
            return inspect(a, { depth: null })
        }
    }
    return String(a)
}

function _logAndReport(level: 'warn' | 'error', ...args: unknown[]): void {
    const debugInstance = level === 'warn' ? debugWarn : debugError
    const consoleMethod = consoleMethodMap[level]
    const sentrySeverity = sentrySeverityMap[level]

    // print to console
    consoleMethod(...args)

    const realErr = args.find((a) => a instanceof Error) as Error | undefined

    if (realErr) {
        debugInstance(realErr.stack ?? realErr.message)
        try {
            Sentry.captureException(realErr)
        } catch (e) {
            // Use console.warn for Sentry failures to avoid potential loops
            console.warn(`Failed to send ${level} exception to Sentry:`, e)
        }
    } else {
        // Build a message string for debug and Sentry.captureMessage
        const msg = args.map(pretty).join(' ')
        debugInstance(msg)
        try {
            Sentry.captureMessage(msg, sentrySeverity)
        } catch (e) {
            console.warn(`Failed to send ${level} message to Sentry:`, e)
        }
    }
}

const logger = {
    debug: debug('app:debug'),
    info: debug('app:info'),

    warn: (...args: unknown[]) => {
        _logAndReport('warn', ...args)
    },

    error: (...args: unknown[]) => {
        _logAndReport('error', ...args)
    },
}

// Enable debug output in development
if (process.env.NODE_ENV === 'development') {
    debug.enable('app:*')
}

export default logger
