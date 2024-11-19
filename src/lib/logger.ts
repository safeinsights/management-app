import debug from 'debug'

const logger = {
    debug: debug('app:debug'),
    info: debug('app:info'),
    warn: debug('app:warn'),
    error: debug('app:error'),
}

// Enable debug output in development
if (process.env.NODE_ENV === 'development') {
    debug.enable('app:*')
}

// Forward warnings and errors to console
logger.warn.log = console.warn.bind(console)
logger.error.log = console.error.bind(console)

export default logger
