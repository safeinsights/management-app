const isDevelopment = process.env.NODE_ENV === 'development'

const logger = {
    debug: (...args: unknown[]) => {
        if (isDevelopment) {
            console.warn('[DEBUG]', ...args)
        }
    },
    info: (...args: unknown[]) => {
        if (isDevelopment) {
            console.warn('[INFO]', ...args)
        }
    },
    warn: (...args: unknown[]) => {
        console.warn('[WARN]', ...args)
    },
    error: (...args: unknown[]) => {
        console.error('[ERROR]', ...args)
    },
}

export default logger
