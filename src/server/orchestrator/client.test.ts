import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession } from './client'

vi.mock('@/server/config', () => ({
    getConfigValue: vi.fn(async (key: string) => {
        if (key === 'ORCHESTRATOR_URL') return 'https://ide.test'
        if (key === 'ORCHESTRATOR_SERVICE_TOKEN') return 'secret'
        return null
    }),
}))

describe('createSession', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns parsed session on 201', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    session_id: 'sess-1',
                    session_url: 'https://ide.test/session/jti?token=jwt',
                    session_token: 'jwt',
                    expires_at: new Date(Date.now() + 3600_000).toISOString(),
                    pod_name: 'pod-1',
                    status: 'active',
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } },
            ),
        )

        const result = await createSession({ user_id: 'u-1', study_id: 's-1', user_email: 'u@test' })
        expect(result.session_id).toBe('sess-1')
        expect(result.session_url).toContain('jti')

        const call = fetchMock.mock.calls[0]
        expect(call[0]).toBe('https://ide.test/internal/sessions')
        const init = call[1] as RequestInit
        expect(init.method).toBe('POST')
        expect((init.headers as Record<string, string>)['X-Orchestrator-Auth']).toBe('secret')
    })

    it('throws OrchestratorError with 503 + Retry-After on warm pool empty', async () => {
        fetchMock.mockResolvedValueOnce(new Response('pool empty', { status: 503, headers: { 'Retry-After': '8' } }))

        await expect(createSession({ user_id: 'u', study_id: 's', user_email: '' })).rejects.toMatchObject({
            status: 503,
            retryAfterSec: 8,
        })
    })

    it('throws OrchestratorError on other non-2xx', async () => {
        fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))

        await expect(createSession({ user_id: 'u', study_id: 's', user_email: '' })).rejects.toMatchObject({
            status: 403,
            retryAfterSec: null,
        })
    })

    it('defaults retry-after to 5 if header missing', async () => {
        fetchMock.mockResolvedValueOnce(new Response('pool empty', { status: 503 }))

        await expect(createSession({ user_id: 'u', study_id: 's', user_email: '' })).rejects.toMatchObject({
            status: 503,
            retryAfterSec: 5,
        })
    })
})
