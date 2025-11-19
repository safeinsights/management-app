import { expect, test, vi, type Mock } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'

vi.mock('@/lib/logger', () => {
    const error = vi.fn()
    return {
        __esModule: true,
        default: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error,
        },
    }
})

async function getStatusRows(jobId: string) {
    return await db
        .selectFrom('jobStatusChange')
        .select(['status', 'message', 'createdAt'])
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .execute()
}

function countMatching(rows: { status: string; message: string | null }[], status: string, message?: string | null) {
    return rows.filter((r) => r.status === status && (message === undefined ? true : (r.message ?? null) === message))
        .length
}

test('code-push inserts JOB-PACKAGING once and is idempotent for same payload', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-PACKAGING')

    const req1 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-PACKAGING' }),
    })
    const resp1 = await apiHandler.POST(req1)
    expect(resp1.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterFirst = countMatching(rows, 'JOB-PACKAGING')
    expect(afterFirst).toBeGreaterThan(baseline)

    const req2 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-PACKAGING' }),
    })
    const resp2 = await apiHandler.POST(req2)
    expect(resp2.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterSecond = countMatching(rows, 'JOB-PACKAGING')
    expect(afterSecond).toBe(afterFirst)
})

test('code-push persists JOB-READY', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-READY')

    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-READY' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(true)

    rows = await getStatusRows(jobId)
    expect(countMatching(rows, 'JOB-READY')).toBeGreaterThan(baseline)
})

test('code-push persists JOB-ERRORED message and inserts on message change only', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-ERRORED')

    // first error
    const msg1 = 'Containerizer failed during build step'
    const req1 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED', message: msg1 }),
    })
    const resp1 = await apiHandler.POST(req1)
    expect(resp1.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterFirstErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterFirstErr).toBeGreaterThan(baseline)
    expect(rows.some((r) => r.status === 'JOB-ERRORED' && r.message === msg1)).toBe(true)

    // idempotent repeat with same message
    const req2 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED', message: msg1 }),
    })
    const resp2 = await apiHandler.POST(req2)
    expect(resp2.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterSecondErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterSecondErr).toBe(afterFirstErr)

    // new message should insert
    const msg2 = 'Containerizer failed in post_build'
    const req3 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED', message: msg2 }),
    })
    const resp3 = await apiHandler.POST(req3)
    expect(resp3.ok).toBe(true)

    rows = await getStatusRows(jobId)
    expect(countMatching(rows, 'JOB-ERRORED')).toBe(afterFirstErr + 1)
    expect(rows.some((r) => r.status === 'JOB-ERRORED' && r.message === msg2)).toBe(true)
})
test('rejects messages longer than 4KB with 400 invalid-payload', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const longMsg = 'a'.repeat(4097) // 1 char over 4KB limit
    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED', message: longMsg }),
    })

    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(400)

    const body = await resp.json()
    expect(body.error).toBe('invalid-payload')

    type ZodIssueLike = { path?: (string | number)[] }

    const messageIssue = (body.issues as ZodIssueLike[]).find((issue) => issue.path?.[0] === 'message')
    expect(messageIssue).toBeDefined()
})

test('accepts messages up to 4KB', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const maxMsg = 'a'.repeat(4096)
    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED', message: maxMsg }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(true)

    const rows = await getStatusRows(jobId)
    expect(rows.some((r) => r.status === 'JOB-ERRORED' && r.message === maxMsg)).toBe(true)
})

test('logs error with context on invalid payload', async () => {
    const badReq = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'job-invalid', status: 'INVALID_STATUS' }),
    })

    const resp = await apiHandler.POST(badReq)
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(400)

    const { default: logger } = await import('@/lib/logger')
    const errorMock = logger.error as unknown as Mock
    const calls = errorMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)

    const [message, err, context] = calls[calls.length - 1]

    expect(message).toBe('Error handling /api/services/code-push POST')
    expect(err).toBeInstanceOf(Error)
    expect(context).toMatchObject({
        route: '/api/services/code-push',
        body: { jobId: 'job-invalid', status: 'INVALID_STATUS' },
    })
})

test('returns 404 job-not-found for unknown jobId', async () => {
    const badJobId = '00000000-0000-0000-0000-000000000000'
    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId: badJobId, status: 'JOB-PACKAGING' }),
    })

    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(404)

    const body = await resp.json()
    expect(body).toEqual({ error: 'job-not-found' })
})
