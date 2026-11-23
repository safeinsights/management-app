import { beforeEach, expect, test, vi } from 'vitest'
import { ensureRunner } from '@/server/microvm/runner'
import { verifySyncToken } from '@/server/microvm/workspaces'
import * as route from './route'

vi.mock('@/server/microvm/runner', () => ({ ensureRunner: vi.fn() }))
vi.mock('@/server/microvm/workspaces', () => ({ verifySyncToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const studyId = '01a11e77-c475-76d9-a1c2-765bf7fd232d'
const post = (body: object, token?: string) =>
    route.POST(
        new Request('http://localhost/api/microvm/runner', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: JSON.stringify(body),
        }),
    )

beforeEach(() => {
    // The token is the study's only when both are the pair the IDE was launched with.
    vi.mocked(verifySyncToken).mockImplementation(async (id, token) => id === studyId && token === 'the-sync-token')
    vi.mocked(ensureRunner).mockResolvedValue({
        ready: true,
        id: 'runner-1',
        endpoint: 'https://runner',
        token: 't',
        expiresAt: 1,
        commandLines: { r: 'Rscript %f' },
    })
})

test('refuses a request with no token', async () => {
    expect((await post({ studyId })).status).toBe(401)
    expect(ensureRunner).not.toHaveBeenCalled()
})

// The sync token of one study must not open the runner of another.
test('refuses the token of one study with the id of another', async () => {
    const resp = await post({ studyId: '01a11e77-c475-76d9-a1c2-000000000000' }, 'the-sync-token')
    expect(resp.status).toBe(401)
    expect(ensureRunner).not.toHaveBeenCalled()
})

test('refuses a body that names no study', async () => {
    expect((await post({}, 'the-sync-token')).status).toBe(400)
})

test('answers with the way to the study runner', async () => {
    const resp = await post({ studyId }, 'the-sync-token')
    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual({
        ready: true,
        id: 'runner-1',
        endpoint: 'https://runner',
        token: 't',
        expiresAt: 1,
        commandLines: { r: 'Rscript %f' },
    })
    expect(vi.mocked(ensureRunner).mock.calls[0][0]).toBe(studyId)
})

// The token must not be kept by anything between the app and the IDE.
test('marks the answer as not to be stored', async () => {
    const resp = await post({ studyId }, 'the-sync-token')
    expect(resp.headers.get('cache-control')).toBe('no-store')
})

test('answers 409 with the reason when the runner is not ready', async () => {
    vi.mocked(ensureRunner).mockResolvedValue({ ready: false, message: 'The run environment is not ready.' })
    const resp = await post({ studyId }, 'the-sync-token')
    expect(resp.status).toBe(409)
    expect(await resp.json()).toEqual({ ready: false, message: 'The run environment is not ready.' })
})
