import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'

const TEST_SECRET = 'test-webhook-secret-value'

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

vi.mock('@/server/aws', () => ({
    storeS3File: vi.fn(),
    fetchS3File: vi.fn(),
    signedUrlForFile: vi.fn(),
}))

async function getJobStatusRows(jobId: string) {
    return await db
        .selectFrom('jobStatusChange')
        .select(['status', 'createdAt'])
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .execute()
}

function authedRequest(body: object) {
    return new Request('http://localhost/api/services/job-scan-results', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
        body: JSON.stringify(body),
    })
}

test('returns 401 when Authorization header is missing', async () => {
    const req = new Request('http://localhost/api/services/job-scan-results', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'any-id', status: 'CODE-SUBMITTED' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})

test('returns 401 when Authorization token is wrong', async () => {
    const req = new Request('http://localhost/api/services/job-scan-results', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
        body: JSON.stringify({ jobId: 'any-id', status: 'CODE-SUBMITTED' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'unauthorized' })
})

test('returns 400 on invalid payload', async () => {
    const resp = await apiHandler.POST(authedRequest({ jobId: 'some-id', status: 'INVALID_STATUS' }))
    expect(resp.status).toBe(400)
    const body = await resp.json()
    expect(body.error).toBe('invalid-payload')
})

test('returns 404 for unknown jobId', async () => {
    const badJobId = '00000000-0000-0000-0000-000000000000'
    const resp = await apiHandler.POST(authedRequest({ jobId: badJobId, status: 'CODE-SUBMITTED' }))
    expect(resp.status).toBe(404)
    const body = await resp.json()
    expect(body).toEqual({ error: 'job-not-found' })
})

test('inserts CODE-SUBMITTED status', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SUBMITTED' }))
    expect(resp.ok).toBe(true)

    const rows = await getJobStatusRows(jobId)
    expect(rows.some((r) => r.status === 'CODE-SUBMITTED')).toBe(true)
})

test('inserts CODE-SCANNED status', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SCANNED' }))
    expect(resp.ok).toBe(true)

    const rows = await getJobStatusRows(jobId)
    expect(rows.some((r) => r.status === 'CODE-SCANNED')).toBe(true)
})

test('inserts JOB-ERRORED status', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(resp.ok).toBe(true)

    const rows = await getJobStatusRows(jobId)
    expect(rows.some((r) => r.status === 'JOB-ERRORED')).toBe(true)
})

test('encrypts and stores plaintextLog on JOB-ERRORED', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', plaintextLog: 'Scan failed during analysis.' }),
    )
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.some((f) => f.fileType === 'ENCRYPTED-PACKAGING-ERROR-LOG')).toBe(true)
})

test('encrypts and stores plaintextLog on CODE-SCANNED', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'CODE-SCANNED', plaintextLog: 'Scan results: no issues found.' }),
    )
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.some((f) => f.fileType === 'ENCRYPTED-SECURITY-SCAN-LOG')).toBe(true)
})

test('idempotency: duplicate same-status calls do not create duplicate rows', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp1 = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SUBMITTED' }))
    expect(resp1.ok).toBe(true)

    const rowsAfterFirst = await getJobStatusRows(jobId)
    const countFirst = rowsAfterFirst.filter((r) => r.status === 'CODE-SUBMITTED').length

    const resp2 = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SUBMITTED' }))
    expect(resp2.ok).toBe(true)

    const rowsAfterSecond = await getJobStatusRows(jobId)
    const countSecond = rowsAfterSecond.filter((r) => r.status === 'CODE-SUBMITTED').length

    expect(countSecond).toBe(countFirst)
})
