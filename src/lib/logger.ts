import debug from 'debug'
import * as Sentry from '@sentry/nextjs'
import type { SeverityLevel } from '@sentry/nextjs'

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

// Not util.inspect: in the browser Next swaps in a util polyfill whose eval trips the CSP (OTTER-679).
function circularSafeReplacer() {
    // Only the current path counts, so an object that is merely repeated is not marked as circular.
    const ancestors: object[] = []
    return function (this: object, _key: string, value: unknown) {
        if (typeof value === 'bigint') return `${value}n`
        if (typeof value !== 'object' || value === null) return value
        while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
        if (ancestors.includes(value)) return '[Circular]'
        ancestors.push(value)
        return value
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
            // A throwing getter or toJSON throws again here, and pretty() runs outside safeCapture.
            try {
                return JSON.stringify(a, circularSafeReplacer())
            } catch {
                return '[Unserializable]'
            }
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
