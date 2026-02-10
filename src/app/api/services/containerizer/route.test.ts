import { expect, test, vi, type Mock } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'

const TEST_SECRET = 'test-webhook-secret-value'

process.env.CODE_PUSH_WEBHOOK_SECRET = TEST_SECRET

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

vi.mock('@/server/aws', () => ({
    storeS3File: vi.fn(),
    fetchS3File: vi.fn(),
    signedUrlForFile: vi.fn(),
}))

async function getStatusRows(jobId: string) {
    return await db
        .selectFrom('jobStatusChange')
        .select(['status', 'createdAt'])
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .execute()
}

function countMatching(rows: { status: string }[], status: string) {
    return rows.filter((r) => r.status === status).length
}

function authedRequest(body: object) {
    return new Request('http://localhost/api/services/containerizer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
        body: JSON.stringify(body),
    })
}

test('containerizer inserts JOB-PACKAGING once and is idempotent for same payload', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-PACKAGING')

    const resp1 = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-PACKAGING' }))
    expect(resp1.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterFirst = countMatching(rows, 'JOB-PACKAGING')
    expect(afterFirst).toBeGreaterThan(baseline)

    const resp2 = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-PACKAGING' }))
    expect(resp2.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterSecond = countMatching(rows, 'JOB-PACKAGING')
    expect(afterSecond).toBe(afterFirst)
})

test('containerizer persists JOB-READY', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-READY')

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-READY' }))
    expect(resp.ok).toBe(true)

    rows = await getStatusRows(jobId)
    expect(countMatching(rows, 'JOB-READY')).toBeGreaterThan(baseline)
})

test('containerizer persists JOB-ERRORED once and is idempotent for same status', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-ERRORED')

    const resp1 = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(resp1.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterFirstErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterFirstErr).toBeGreaterThan(baseline)

    const resp2 = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(resp2.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterSecondErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterSecondErr).toBe(afterFirstErr)
})

test('logs error with context on invalid payload', async () => {
    const resp = await apiHandler.POST(authedRequest({ jobId: 'job-invalid', status: 'INVALID_STATUS' }))
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(400)

    const { default: logger } = await import('@/lib/logger')
    const errorMock = logger.error as unknown as Mock
    const calls = errorMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)

    const [message, err, context] = calls[calls.length - 1]

    expect(message).toBe('Error handling /api/services/containerizer POST')
    expect(err).toBeInstanceOf(Error)
    expect(context).toMatchObject({
        route: '/api/services/containerizer',
        body: { jobId: 'job-invalid', status: 'INVALID_STATUS' },
    })
})

test('returns 404 job-not-found for unknown jobId', async () => {
    const badJobId = '00000000-0000-0000-0000-000000000000'
    const resp = await apiHandler.POST(authedRequest({ jobId: badJobId, status: 'JOB-PACKAGING' }))
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(404)

    const body = await resp.json()
    expect(body).toEqual({ error: 'job-not-found' })
})

test('containerizer encrypts and stores plaintextLog on JOB-ERRORED', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({
            jobId,
            status: 'JOB-ERRORED',
            plaintextLog: 'Build failed during code packaging/scanning.',
        }),
    )
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.some((f) => f.fileType === 'ENCRYPTED-LOG')).toBe(true)
})

test('returns 401 when Authorization header is missing', async () => {
    const req = new Request('http://localhost/api/services/containerizer', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'any-id', status: 'JOB-PACKAGING' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})

test('returns 401 when Authorization token is wrong', async () => {
    const req = new Request('http://localhost/api/services/containerizer', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
        body: JSON.stringify({ jobId: 'any-id', status: 'JOB-PACKAGING' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})
