import { describe, expect, it, type Mock } from '@/tests/unit.helpers'
import { vi } from 'vitest'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    captureMessage: vi.fn(),
}))

// The test setup already loaded the logger against the real Sentry, so load a fresh copy.
const freshLogger = async () => {
    vi.resetModules()
    const { default: logger } = await import('./logger')
    const { captureMessage } = await import('@sentry/nextjs')
    return { logger, captureMessage: captureMessage as Mock }
}

describe('logger', () => {
    it('reports objects that JSON cannot serialize', async () => {
        const { logger, captureMessage } = await freshLogger()
        const study: Record<string, unknown> = { id: 7, size: BigInt(10) }
        study.self = study

        logger.warn('bad study', study)

        expect(captureMessage).toHaveBeenCalledWith('bad study {"id":7,"size":"10n","self":"[Circular]"}', 'warning')
    })

    it('does not mark an object that is only repeated as circular', async () => {
        const { logger, captureMessage } = await freshLogger()
        const org = { slug: 'acme' }

        logger.warn('x', { owner: org, reviewer: org, n: BigInt(10) })

        expect(captureMessage).toHaveBeenCalledWith(
            'x {"owner":{"slug":"acme"},"reviewer":{"slug":"acme"},"n":"10n"}',
            'warning',
        )
    })

    it('still reports when serializing the object throws', async () => {
        const { logger, captureMessage } = await freshLogger()
        const payload = {
            get detail() {
                throw new Error('unavailable')
            },
        }

        expect(() => logger.warn('Could not process payload', payload)).not.toThrow()
        expect(captureMessage).toHaveBeenCalledWith('Could not process payload [Unserializable]', 'warning')
    })
})
