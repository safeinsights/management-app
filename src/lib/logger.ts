import debug from 'debug'

const logger = {
    debug: debug('app:debug'),
    info: debug('app:info'),
    warn: (...args: unknown[]) => {
        debug('app:warn')(...args)
        console.warn('[WARN]', ...args)
    },
    error: (...args: unknown[]) => {
        debug('app:error')(...args)
        console.error('[ERROR]', ...args)
    },
}

// Enable debug output in development
if (process.env.NODE_ENV === 'development') {
    debug.enable('app:*')
}

export default logger
