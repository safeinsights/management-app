import { expect, test, vi, type Mock } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData, readTestSupportFile } from '@/tests/unit.helpers'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'

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

async function ensureValidUserPublicKeysForOrg(orgId: string) {
    const publicKeyPem = await readTestSupportFile('public_key.pem')
    const publicKey = pemToArrayBuffer(publicKeyPem)
    const fingerprint = await fingerprintKeyData(publicKey)

    const orgUserIds = await db.selectFrom('orgUser').select(['userId']).where('orgId', '=', orgId).execute()
    const userIds = orgUserIds.map((r) => r.userId)

    if (!userIds.length) return

    await db
        .updateTable('userPublicKey')
        .set({ publicKey: Buffer.from(publicKey), fingerprint })
        .where('userId', 'in', userIds)
        .execute()
}

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

test('code-push persists JOB-ERRORED once and is idempotent for same status', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
    await ensureValidUserPublicKeysForOrg(org.id)
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    let rows = await getStatusRows(jobId)
    const baseline = countMatching(rows, 'JOB-ERRORED')

    const req1 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    const resp1 = await apiHandler.POST(req1)
    expect(resp1.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterFirstErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterFirstErr).toBeGreaterThan(baseline)

    const req2 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    const resp2 = await apiHandler.POST(req2)
    expect(resp2.ok).toBe(true)

    rows = await getStatusRows(jobId)
    const afterSecondErr = countMatching(rows, 'JOB-ERRORED')
    expect(afterSecondErr).toBe(afterFirstErr)
})

test('code-push stores an ENCRYPTED-LOG when JOB-ERRORED happens before JOB-READY', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
    await ensureValidUserPublicKeysForOrg(org.id)
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    // Ensure no READY exists for this job.
    await db.deleteFrom('jobStatusChange').where('studyJobId', '=', jobId).where('status', '=', 'JOB-READY').execute()

    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()

    expect(files.some((f) => f.fileType === 'ENCRYPTED-LOG')).toBe(true)
})

test('code-push does not store a fake ENCRYPTED-LOG when JOB-READY already exists', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
    await ensureValidUserPublicKeysForOrg(org.id)
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    // Create READY for this specific job.
    await db.insertInto('jobStatusChange').values({ status: 'JOB-READY', studyJobId: jobId, userId: user.id }).execute()

    const baseline = await db
        .selectFrom('studyJobFile')
        .select(['id'])
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-LOG')
        .execute()

    const req = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    const resp = await apiHandler.POST(req)
    expect(resp.ok).toBe(true)

    const after = await db
        .selectFrom('studyJobFile')
        .select(['id'])
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-LOG')
        .execute()

    expect(after.length).toBe(baseline.length)
})

test('code-push does not duplicate ENCRYPTED-LOG when one already exists', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
    await ensureValidUserPublicKeysForOrg(org.id)
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    // Ensure no READY exists
    await db.deleteFrom('jobStatusChange').where('studyJobId', '=', jobId).where('status', '=', 'JOB-READY').execute()

    // First JOB-ERRORED creates the log
    const req1 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    await apiHandler.POST(req1)

    const afterFirst = await db
        .selectFrom('studyJobFile')
        .select(['id'])
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-LOG')
        .execute()
    expect(afterFirst.length).toBe(1)

    // Reset status so second JOB-ERRORED is not idempotent-blocked by status check
    await db.deleteFrom('jobStatusChange').where('studyJobId', '=', jobId).where('status', '=', 'JOB-ERRORED').execute()

    // Second JOB-ERRORED should not create another log (hasLog check)
    const req2 = new Request('http://localhost/api/services/code-push', {
        method: 'POST',
        body: JSON.stringify({ jobId, status: 'JOB-ERRORED' }),
    })
    await apiHandler.POST(req2)

    const afterSecond = await db
        .selectFrom('studyJobFile')
        .select(['id'])
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-LOG')
        .execute()
    expect(afterSecond.length).toBe(1)
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
