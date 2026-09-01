import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData, BLANK_UUID } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { fetchFileContents } from '@/server/storage'

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
    const resp = await apiHandler.POST(authedRequest({ jobId: BLANK_UUID, status: 'CODE-SUBMITTED' }))
    expect(resp.status).toBe(404)
    const body = await resp.json()
    expect(body).toEqual({ error: 'job-not-found' })
})

// CODE-SUBMITTED is owned by markCodeSubmitted, not the scanner, so a stray scanner echo can't
// corrupt the append-only submission log.
test('ignores CODE-SUBMITTED (the scanner does not own that status)', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SUBMITTED' }))
    expect(resp.ok).toBe(true)

    const rows = await getJobStatusRows(jobId)
    expect(rows.some((r) => r.status === 'CODE-SUBMITTED')).toBe(false)
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

// Real S3, so skipped without SeaweedFS locally; on CI s3.helpers throws instead.
test.skipIf(!s3Available)('stores encrypted and plaintext logs on JOB-ERRORED', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', plaintextLog: 'Scan failed during analysis.' }),
    )
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.some((f) => f.fileType === 'ENCRYPTED-PACKAGING-ERROR-LOG')).toBe(true)
    expect(files.some((f) => f.fileType === 'PACKAGING-ERROR-LOG')).toBe(true)
})

test.skipIf(!s3Available)('stores encrypted and plaintext logs on CODE-SCANNED', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'CODE-SCANNED', plaintextLog: 'Scan results: no issues found.' }),
    )
    expect(resp.ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.some((f) => f.fileType === 'ENCRYPTED-SECURITY-SCAN-LOG')).toBe(true)
    expect(files.some((f) => f.fileType === 'SECURITY-SCAN-LOG')).toBe(true)
})

// OTTER-642: log files were stored on every call, so a re-delivered CODE-SCANNED doubled the
// scan-log rows. storeJobFile now updates in place.
test.skipIf(!s3Available)('does not duplicate log files when CODE-SCANNED is delivered twice', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const body = { jobId, status: 'CODE-SCANNED', plaintextLog: 'Scan results: no issues found.' }
    expect((await apiHandler.POST(authedRequest(body))).ok).toBe(true)
    expect((await apiHandler.POST(authedRequest(body))).ok).toBe(true)

    const files = await db.selectFrom('studyJobFile').select(['fileType']).where('studyJobId', '=', jobId).execute()
    expect(files.filter((f) => f.fileType === 'ENCRYPTED-SECURITY-SCAN-LOG')).toHaveLength(1)
    expect(files.filter((f) => f.fileType === 'SECURITY-SCAN-LOG')).toHaveLength(1)
})

// One scan log is stored twice: encrypted for the researcher, plaintext for the reviewer. Once the
// encrypted half is shared its keys pin the ciphertext, so the plaintext half must be refused with
// it, or the reviewer sees findings from a log the researcher cannot open.
test.skipIf(!s3Available)('leaves the plaintext scan log alone when its encrypted half is refused', async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const first = { jobId, status: 'CODE-SCANNED', plaintextLog: 'Scan results: no issues found.' }
    expect((await apiHandler.POST(authedRequest(first))).ok).toBe(true)

    const encrypted = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-SECURITY-SCAN-LOG')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('studyJobFileRecipientKey')
        .values({
            studyJobFileId: encrypted.id,
            filePath: 'security-scan-log.txt',
            fingerprint: 'test-fingerprint',
            crypt: 'test-crypt',
        })
        .execute()

    const plaintext = await db
        .selectFrom('studyJobFile')
        .select('path')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'SECURITY-SCAN-LOG')
        .executeTakeFirstOrThrow()

    const rescan = { jobId, status: 'CODE-SCANNED', plaintextLog: 'Scan results: 3 critical findings.' }
    expect((await apiHandler.POST(authedRequest(rescan))).ok).toBe(true)

    // Asserted on the stored bytes: both halves update in place, so a replacement is invisible in
    // the database.
    const contents = await (await fetchFileContents(plaintext.path)).text()
    expect(contents).toContain('no issues found')
    expect(contents).not.toContain('3 critical findings')
})

// A stray CODE-SUBMITTED echo would corrupt the append-only submission count, turning a decided
// round back into "under review".
test('ignores a CODE-SUBMITTED echo even after the round has been decided', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    await db
        .insertInto('jobStatusChange')
        .values([
            { studyJobId: jobId, status: 'CODE-SUBMITTED', userId: user.id },
            { studyJobId: jobId, status: 'CODE-CHANGES-REQUESTED', userId: user.id },
        ])
        .execute()

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SUBMITTED' }))
    expect(resp.ok).toBe(true)

    const rows = await getJobStatusRows(jobId)
    expect(rows.filter((r) => r.status === 'CODE-SUBMITTED').length).toBe(1)
})

test('idempotency: duplicate same-status calls do not create duplicate rows', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp1 = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SCANNED' }))
    expect(resp1.ok).toBe(true)

    const rowsAfterFirst = await getJobStatusRows(jobId)
    const countFirst = rowsAfterFirst.filter((r) => r.status === 'CODE-SCANNED').length
    expect(countFirst).toBe(1)

    const resp2 = await apiHandler.POST(authedRequest({ jobId, status: 'CODE-SCANNED' }))
    expect(resp2.ok).toBe(true)

    const rowsAfterSecond = await getJobStatusRows(jobId)
    const countSecond = rowsAfterSecond.filter((r) => r.status === 'CODE-SCANNED').length

    expect(countSecond).toBe(countFirst)
})
