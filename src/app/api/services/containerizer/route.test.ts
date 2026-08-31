import { expect, test, vi, type Mock } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, mockSessionWithTestData, BLANK_UUID } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'

const TEST_SECRET = 'test-webhook-secret-value'

process.env.CODEBUILD_WEBHOOK_SECRET = TEST_SECRET

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

async function erroredReasons(jobId: string) {
    const rows = await db
        .selectFrom('jobStatusChange')
        .select(['message'])
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .execute()
    return rows.map((r) => r.message)
}

// OTTER-524: a packaging failure has no log to send, so a classified failure class is the only thing
// that can explain it. It has to survive the round trip into jobStatusChange.
test('containerizer records a known failure reason alongside JOB-ERRORED', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'BASE_IMAGE_UNAVAILABLE' }),
    )
    expect(resp.ok).toBe(true)

    expect(await erroredReasons(jobId)).toContain('BASE_IMAGE_UNAVAILABLE')
})

// The containerizer deploys independently of this app. A code we do not recognize yet must not fail
// validation, or that deploy would stop jobs being marked errored at all. It is dropped, not stored.
test('containerizer accepts an unknown failure reason without storing it', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'SOMETHING_WE_DO_NOT_KNOW' }),
    )
    expect(resp.ok).toBe(true)

    expect(await erroredReasons(jobId)).not.toContain('SOMETHING_WE_DO_NOT_KNOW')
})

// Nothing a build script writes may be stored verbatim, so infrastructure detail cannot reach the
// database and be surfaced later by accident.
test('containerizer discards raw text sent as a failure reason', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const raw = 'Command "aws s3 sync s3://si-prod-bucket/studies/org/study/jobs/job/code" exited with code 1'
    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: raw }))
    expect(resp.ok).toBe(true)

    const reasons = await erroredReasons(jobId)
    expect(reasons).not.toContain(raw)
    expect(reasons.every((r) => !r?.includes('s3://'))).toBe(true)
})

// A classified failure is delivered twice: the build script posts the reason from its own handler,
// then the buildspec's post_build fallback fires and posts the bare payload. The script always goes
// first, so the status dedup has to leave the classified row alone rather than the bare one winning.
test('containerizer keeps the recorded reason when the bare fallback follows it', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const first = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'BASE_IMAGE_UNAVAILABLE' }),
    )
    expect(first.ok).toBe(true)
    const second = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(second.ok).toBe(true)

    expect(await erroredReasons(jobId)).toEqual(['BASE_IMAGE_UNAVAILABLE'])
})

// The reverse order of the test above, which the buildspec is not required to guarantee: a CodeBuild
// abort can fire the bare fallback before the script's own handler ever posts. The status dedup
// discards the duplicate row, so the code has to be recorded against the row already there rather
// than dropped with it.
test('containerizer records a reason that arrives after the bare failure', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const first = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(first.ok).toBe(true)
    const second = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'BASE_IMAGE_UNAVAILABLE' }),
    )
    expect(second.ok).toBe(true)

    expect(await erroredReasons(jobId)).toEqual(['BASE_IMAGE_UNAVAILABLE'])
})

// Backfilling a code-less row must not turn into clearing a recorded one when the follow-up delivery
// carries something this app cannot classify.
test('containerizer keeps a recorded reason when an unknown code follows it', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'BASE_IMAGE_UNAVAILABLE' }))
    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'SOMETHING_WE_DO_NOT_KNOW' }),
    )
    expect(resp.ok).toBe(true)

    expect(await erroredReasons(jobId)).toEqual(['BASE_IMAGE_UNAVAILABLE'])
})

// Another producer can get to JOB-ERRORED first: `/api/job/[jobId]` and the enclave both write free
// text into this column. The dedup then lands on their row, so backfilling has to key on whether a
// CLASSIFIED code is already recorded rather than on the column being empty, or the one value the
// errored screen can explain is lost to text that is never displayed anyway.
test('containerizer records a reason against an errored row holding unclassified text', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    // createdAt is set rather than defaulted, so this row is unambiguously the job's latest status.
    // Every row a test writes otherwise carries the same created_at: the suite runs each test inside
    // one transaction (tests/vitest.setup.ts) and the column defaults to now(), which is that
    // transaction's start time, not the moment of the insert. The route picks the last status by
    // created_at then id, so with the timestamps tied the winner is decided by two v7uuid() values,
    // and their order below a millisecond is random. Left to the default, the route intermittently
    // read INITIATED as the last status and inserted a second JOB-ERRORED row instead of
    // backfilling this one.
    await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: jobId,
            status: 'JOB-ERRORED',
            message: 'Task stopped: exit code 137',
            createdAt: new Date(Date.now() + 1_000),
        })
        .execute()

    const resp = await apiHandler.POST(
        authedRequest({ jobId, status: 'JOB-ERRORED', failureReason: 'BASE_IMAGE_UNAVAILABLE' }),
    )
    expect(resp.ok).toBe(true)

    expect(await erroredReasons(jobId)).toEqual(['BASE_IMAGE_UNAVAILABLE'])
})

// The buildspec's fallback path posts the payload raw when the build dies before its own handler
// runs, so a reason-less failure webhook has to stay valid permanently.
test('containerizer still accepts a failure webhook with no reason', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    const jobId = jobIds[0]

    const resp = await apiHandler.POST(authedRequest({ jobId, status: 'JOB-ERRORED' }))
    expect(resp.ok).toBe(true)

    expect(await erroredReasons(jobId)).toContain(null)
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
    const resp = await apiHandler.POST(authedRequest({ jobId: BLANK_UUID, status: 'JOB-PACKAGING' }))
    expect(resp.ok).toBe(false)
    expect(resp.status).toBe(404)

    const body = await resp.json()
    expect(body).toEqual({ error: 'job-not-found' })
})

// Persists log files through real S3 (storeStudyEncrypted*/storeStudyLogFile),
// so this skips when SeaweedFS isn't running locally; on CI s3.helpers throws instead.
test.skipIf(!s3Available)('containerizer stores encrypted and plaintext logs on JOB-ERRORED', async () => {
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
    expect(files.some((f) => f.fileType === 'ENCRYPTED-PACKAGING-ERROR-LOG')).toBe(true)
    expect(files.some((f) => f.fileType === 'PACKAGING-ERROR-LOG')).toBe(true)
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
