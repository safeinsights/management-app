import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { mockSessionWithTestData, insertTestCodeEnv } from '@/tests/unit.helpers'

const TEST_SECRET = 'test-scan-webhook-secret'

process.env.CODEBUILD_WEBHOOK_SECRET = TEST_SECRET

vi.mock('@/lib/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}))

function authedRequest(body: object) {
    return new Request('http://localhost/api/services/code-env-scan-results', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
        body: JSON.stringify(body),
    })
}

async function getScanRows(codeEnvId: string) {
    return await db
        .selectFrom('codeScan')
        .select(['status', 'results', 'createdAt'])
        .where('codeEnvId', '=', codeEnvId)
        .orderBy('createdAt', 'desc')
        .execute()
}

test('returns 401 when Authorization header is missing', async () => {
    const req = new Request('http://localhost/api/services/code-env-scan-results', {
        method: 'POST',
        body: JSON.stringify({ codeEnvId: 'any', status: 'SCAN-RUNNING' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})

test('returns 401 when token is wrong', async () => {
    const req = new Request('http://localhost/api/services/code-env-scan-results', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
        body: JSON.stringify({ codeEnvId: 'any', status: 'SCAN-RUNNING' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})

test('returns 400 on invalid payload', async () => {
    const resp = await apiHandler.POST(authedRequest({ codeEnvId: 'some-id', status: 'INVALID' }))
    expect(resp.status).toBe(400)
    const body = await resp.json()
    expect(body.error).toBe('invalid-payload')
})

test('returns 404 for unknown codeEnvId', async () => {
    const resp = await apiHandler.POST(
        authedRequest({ codeEnvId: '00000000-0000-0000-0000-000000000000', status: 'SCAN-RUNNING' }),
    )
    expect(resp.status).toBe(404)
    const body = await resp.json()
    expect(body).toEqual({ error: 'code-env-not-found' })
})

test('inserts SCAN-RUNNING status', async () => {
    const { org } = await mockSessionWithTestData({ isAdmin: true })
    const codeEnv = await insertTestCodeEnv({ orgId: org.id })

    const resp = await apiHandler.POST(authedRequest({ codeEnvId: codeEnv.id, status: 'SCAN-RUNNING' }))
    expect(resp.ok).toBe(true)

    const rows = await getScanRows(codeEnv.id)
    expect(rows.some((r) => r.status === 'SCAN-RUNNING')).toBe(true)
})

test('inserts SCAN-COMPLETE with results blob', async () => {
    const { org } = await mockSessionWithTestData({ isAdmin: true })
    const codeEnv = await insertTestCodeEnv({ orgId: org.id })

    const results = 'CVE-2024-1234: high severity\nCVE-2024-5678: low severity'
    const resp = await apiHandler.POST(authedRequest({ codeEnvId: codeEnv.id, status: 'SCAN-COMPLETE', results }))
    expect(resp.ok).toBe(true)

    const rows = await getScanRows(codeEnv.id)
    const completeRow = rows.find((r) => r.status === 'SCAN-COMPLETE')
    expect(completeRow).toBeDefined()
    expect(completeRow!.results).toBe(results)
})

test('inserts SCAN-FAILED status', async () => {
    const { org } = await mockSessionWithTestData({ isAdmin: true })
    const codeEnv = await insertTestCodeEnv({ orgId: org.id })

    const resp = await apiHandler.POST(authedRequest({ codeEnvId: codeEnv.id, status: 'SCAN-FAILED' }))
    expect(resp.ok).toBe(true)

    const rows = await getScanRows(codeEnv.id)
    expect(rows.some((r) => r.status === 'SCAN-FAILED')).toBe(true)
})

test('idempotency: duplicate same-status calls do not create duplicate rows', async () => {
    const { org } = await mockSessionWithTestData({ isAdmin: true })
    const codeEnv = await insertTestCodeEnv({ orgId: org.id })

    const resp1 = await apiHandler.POST(authedRequest({ codeEnvId: codeEnv.id, status: 'SCAN-RUNNING' }))
    expect(resp1.ok).toBe(true)

    const rowsAfterFirst = await getScanRows(codeEnv.id)
    const runningCountFirst = rowsAfterFirst.filter((r) => r.status === 'SCAN-RUNNING').length

    const resp2 = await apiHandler.POST(authedRequest({ codeEnvId: codeEnv.id, status: 'SCAN-RUNNING' }))
    expect(resp2.ok).toBe(true)

    const rowsAfterSecond = await getScanRows(codeEnv.id)
    const runningCountSecond = rowsAfterSecond.filter((r) => r.status === 'SCAN-RUNNING').length

    expect(runningCountSecond).toBe(runningCountFirst)
})
