import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestJobInfo, testUploadFile } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { db } from '@/database'
import { sql } from 'kysely'
import { pathForStudyJob } from '@/lib/paths'
import { sendResultsReadyForReviewEmail } from '@/server/mailer'
import { fetchFileContents } from '@/server/storage'

vi.mock('@/server/mailer', () => ({
    sendResultsReadyForReviewEmail: vi.fn(),
}))

vi.mock('@/server/aws', () => ({
    storeS3File: vi.fn(),
    fetchS3File: vi.fn(async function* () {
        yield new Uint8Array([116, 101, 115, 116]) // 'test'
    }),
    signedUrlForFile: vi.fn(),
}))

// Real S3 round-trip, so skipped without SeaweedFS locally; on CI s3.helpers throws instead.
test.skipIf(!s3Available)('uploading results', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const studyJobId = jobInfo.studyJobId

    const file = testUploadFile('testfile.txt', 'text/plain')

    const formData = new FormData()
    formData.append('result', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: studyJobId }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'fileType'])
        .where('studyJobFile.studyJobId', '=', studyJobId)
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({
        path: expect.any(String),
        fileType: 'ENCRYPTED-RESULT',
    })

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})

// Once a job is RUN-COMPLETE its encrypted results are frozen under already-shared keys, so a
// re-post must be rejected rather than overwrite them. Re-runs use a NEW job.
test.skipIf(!s3Available)('rejects a second results upload once the job is already complete', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    const post = () => {
        const formData = new FormData()
        formData.append('result', testUploadFile('r.txt', 'text/plain'))
        return apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
            params: Promise.resolve({ jobId }),
        })
    }

    expect((await post()).ok).toBe(true)

    const second = await post()
    expect(second.status).toBe(422)

    const rows = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-RESULT')
        .execute()
    expect(rows).toHaveLength(1)
})

// OTTER-642: an errored run never reaches RUN-COMPLETE, so a retried error delivery used to sail
// past the completion guard and re-send the reviewer email.
test.skipIf(!s3Available)('absorbs a repeated log-only (errored) delivery without announcing it twice', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    const post = () => {
        const formData = new FormData()
        formData.append('log', testUploadFile('log.txt', 'text/plain'))
        return apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
            params: Promise.resolve({ jobId }),
        })
    }

    const emailsBefore = vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length

    expect((await post()).ok).toBe(true)
    expect((await post()).ok).toBe(true)

    const logRows = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
        .execute()
    expect(logRows).toHaveLength(1)

    const erroredStatuses = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .execute()
    expect(erroredStatuses).toHaveLength(1)

    expect(vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length).toBe(emailsBefore + 1)
})

// The scan and packaging steps also record JOB-ERRORED, and one of those must not block a real
// delivery.
test.skipIf(!s3Available)('a prior scan/packaging JOB-ERRORED does not block a results delivery', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    await db.insertInto('jobStatusChange').values({ studyJobId: jobId, status: 'JOB-ERRORED' }).execute()

    const formData = new FormData()
    formData.append('result', testUploadFile('r.txt', 'text/plain'))
    const resp = await apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
        params: Promise.resolve({ jobId }),
    })
    expect(resp.status).toBe(200)

    const runComplete = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RUN-COMPLETE')
        .execute()
    expect(runComplete).toHaveLength(1)
})

// A delivery can store its run log and still fail before the status insert and the reviewer email.
// The TOA's retry carries results new to the job, so it is not a repeat and completes normally.
test.skipIf(!s3Available)('completes a retried delivery whose log was already stored', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    const jobPath = pathForStudyJob(jobInfo)
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: jobId,
            path: `${jobPath}/results/encrypted-code-run-log.zip`,
            name: 'encrypted-code-run-log.zip',
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
        })
        .execute()

    const formData = new FormData()
    formData.append('log', testUploadFile('log.txt', 'text/plain'))
    formData.append('result', testUploadFile('r.txt', 'text/plain'))
    const resp = await apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
        params: Promise.resolve({ jobId }),
    })
    expect(resp.status).toBe(200)

    const files = await db.selectFrom('studyJobFile').select('fileType').where('studyJobId', '=', jobId).execute()
    expect(files.filter((f) => f.fileType === 'ENCRYPTED-CODE-RUN-LOG')).toHaveLength(1)
    expect(files.filter((f) => f.fileType === 'ENCRYPTED-RESULT')).toHaveLength(1)

    const runComplete = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RUN-COMPLETE')
        .execute()
    expect(runComplete).toHaveLength(1)
})

// Artifact presence alone would read the retry as a repeat and leave the job running forever, so a
// delivery only counts as handled once the outcome status is recorded.
test.skipIf(!s3Available)('records a missing outcome when the retry carries nothing new', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    const jobPath = pathForStudyJob(jobInfo)
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: jobId,
            path: `${jobPath}/results/encrypted-code-run-log.zip`,
            name: 'encrypted-code-run-log.zip',
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
        })
        .execute()

    const emailsBefore = vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length

    const formData = new FormData()
    formData.append('log', testUploadFile('log.txt', 'text/plain'))
    const resp = await apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
        params: Promise.resolve({ jobId }),
    })
    expect(resp.status).toBe(200)

    const errored = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .execute()
    expect(errored).toHaveLength(1)
    expect(vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length).toBe(emailsBefore + 1)
})

// JOB-ERRORED is shared with the scanner and the containerizer, so a bare status lookup would read
// one of theirs as proof this callback already finished.
test.skipIf(!s3Available)("records a run failure that a prior stage's JOB-ERRORED would have masked", async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    // Dated explicitly: a test runs inside one transaction, where now() is frozen and fixture rows
    // would otherwise tie.
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: jobId, status: 'JOB-ERRORED', createdAt: sql`now() - interval '1 hour'` })
        .execute()

    const jobPath = pathForStudyJob(jobInfo)
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: jobId,
            path: `${jobPath}/results/encrypted-code-run-log.zip`,
            name: 'encrypted-code-run-log.zip',
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
        })
        .execute()

    const formData = new FormData()
    formData.append('log', testUploadFile('log.txt', 'text/plain'))
    const resp = await apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
        params: Promise.resolve({ jobId }),
    })
    expect(resp.status).toBe(200)

    const errored = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .execute()
    expect(errored).toHaveLength(2)
})

// The row lock is deliberately not unit-tested: pg-transactional-tests runs every test on one
// connection inside one transaction, so two requests cannot contend.

// A late delivery can carry an artifact the job never had. It is kept, since nothing was released
// for that slot, but appending RUN-COMPLETE after FILES-APPROVED would break the round-closing
// invariant and email the reviewer about a decided study.
test.skipIf(!s3Available)('does not record an outcome once the round has been decided', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const jobId = jobInfo.studyJobId

    await db.insertInto('jobStatusChange').values({ studyJobId: jobId, status: 'JOB-ERRORED' }).execute()
    await db.insertInto('jobStatusChange').values({ studyJobId: jobId, status: 'FILES-APPROVED' }).execute()

    const emailsBefore = vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length

    const formData = new FormData()
    formData.append('log', testUploadFile('log.txt', 'text/plain'))
    formData.append('result', testUploadFile('r.txt', 'text/plain'))
    const resp = await apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
        params: Promise.resolve({ jobId }),
    })
    expect(resp.status).toBe(200)

    const files = await db.selectFrom('studyJobFile').select('fileType').where('studyJobId', '=', jobId).execute()
    expect(files.filter((f) => f.fileType === 'ENCRYPTED-RESULT')).toHaveLength(1)

    const runComplete = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RUN-COMPLETE')
        .execute()
    expect(runComplete).toHaveLength(0)
    expect(vi.mocked(sendResultsReadyForReviewEmail).mock.calls.length).toBe(emailsBefore)
})

test.skipIf(!s3Available)('uploading logs', async () => {
    const { jobInfo } = await insertTestJobInfo()
    const studyJobId = jobInfo.studyJobId
    const logContents = 'long line one\nlog line two\n'
    const encoder = new TextEncoder()
    const file = new File([encoder.encode(logContents)], 'testfile.log', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('log', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: studyJobId }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'fileType'])
        .where('studyJobFile.studyJobId', '=', studyJobId)
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({
        path: expect.any(String),
        fileType: 'ENCRYPTED-CODE-RUN-LOG',
    })

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})
