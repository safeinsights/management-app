import debug from 'debug'
import { describe, expect, it, vi } from '@/tests/unit.helpers'

describe('logger', () => {
    it('leaves the app debug stream off under Vitest', async () => {
        // Starts from a known state, so a DEBUG value in a local .env cannot decide the result.
        debug.disable()
        vi.resetModules()
        await import('./logger')

        expect(debug.enabled('app:warn')).toBe(false)
        expect(debug.enabled('app:info')).toBe(false)
    })
})
