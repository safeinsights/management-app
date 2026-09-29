import debug from 'debug'
import * as Sentry from '@sentry/nextjs'
import type { SeverityLevel } from '@sentry/nextjs'
import { inspect } from 'util'

const consoleMethodMap = {
    warn: console.warn,
    error: console.error,
} as const

const sentrySeverityMap: Record<'warn' | 'error', SeverityLevel> = {
    warn: 'warning',
    error: 'error',
}

const debugWarn = debug('app:warn')
const debugError = debug('app:error')

// Wrapped so a Sentry failure cannot re-enter the logger and loop.
function safeCapture(fn: () => void, warningMsg: string): void {
    try {
        fn()
    } catch (e) {
        console.warn(warningMsg, e)
    }
}

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
            // circular or too deep for JSON
            return inspect(a, { depth: null })
        }
    }
    return String(a)
}

function logAndReport(level: 'warn' | 'error', ...args: unknown[]): void {
    const debugInstance = level === 'warn' ? debugWarn : debugError
    const consoleMethod = consoleMethodMap[level]
    const sentrySeverity = sentrySeverityMap[level]

    consoleMethod(...args)

    const realErr = args.find((a) => a instanceof Error) as Error | undefined

    if (realErr) {
        debugInstance(realErr.stack ?? realErr.message)
        safeCapture(() => Sentry.captureException(realErr), `Failed to send ${level} exception to Sentry:`)
    } else {
        const msg = args.map(pretty).join(' ')
        debugInstance(msg)
        safeCapture(() => Sentry.captureMessage(msg, sentrySeverity), `Failed to send ${level} message to Sentry:`)
    }
}

const logger = {
    debug: debug('app:debug'),
    info: debug('app:info'),
    warn: (...args: unknown[]) => logAndReport('warn', ...args),
    error: (...args: unknown[]) => logAndReport('error', ...args),
}

debug.enable('app:*')

export default logger
