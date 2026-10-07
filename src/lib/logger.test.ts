import debug from 'debug'
import { describe, expect, it, vi } from '@/tests/unit.helpers'

// Starts from a known state, so a DEBUG value in a local .env cannot decide the result.
const loadLogger = async () => {
    debug.disable()
    vi.resetModules()
    return (await import('./logger')).default
}

describe('logger under Vitest', () => {
    it('routes info through the console, where Vitest ties it to the test', async () => {
        const logger = await loadLogger()
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

        logger.info('study review generated')

        expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('app:info study review generated'))
    })

    it('prints a warning once, through console.warn only', async () => {
        // Spied before loading, because the logger keeps a reference to console.warn.
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
        const logger = await loadLogger()

        logger.warn('mailgun not configured')

        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith('mailgun not configured')
        expect(consoleInfo).not.toHaveBeenCalled()
    })
})
