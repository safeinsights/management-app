import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { db } from '@/database'
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

// These exercise the real S3 round-trip (storeStudyEncrypted*/fetchFileContents),
// so they skip when SeaweedFS isn't running locally; on CI s3.helpers throws instead.
test.skipIf(!s3Available)('uploading results', async () => {
    const org = await insertTestOrg()

    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('result', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'fileType'])
        .where('studyJobFile.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({
        path: expect.any(String),
        fileType: 'ENCRYPTED-RESULT',
    })

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})

// Guards the stale-shared-key case: once a job is RUN-COMPLETE its encrypted results (and the
// AES keys the manifest/researcher rows are wrapped against) are frozen. A re-post must be
// rejected rather than overwrite the blob under already-shared keys. Re-runs use a NEW job.
test.skipIf(!s3Available)('rejects a second results upload once the job is already complete', async () => {
    const org = await insertTestOrg()
    const { jobIds } = await insertTestStudyData({ org })
    const jobId = jobIds[0]

    const post = () => {
        const formData = new FormData()
        formData.append('result', new File([new Uint8Array([1, 2, 3])], 'r.txt', { type: 'text/plain' }))
        return apiHandler.POST(new Request('http://localhost', { method: 'POST', body: formData }), {
            params: Promise.resolve({ jobId }),
        })
    }

    expect((await post()).ok).toBe(true)

    const second = await post()
    expect(second.status).toBe(422)

    // The rejected re-post must not have created a duplicate ENCRYPTED-RESULT row.
    const rows = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-RESULT')
        .execute()
    expect(rows).toHaveLength(1)
})

// An errored run is recorded as JOB-ERRORED and never reaches RUN-COMPLETE, so before OTTER-642 a
// retried error delivery sailed past the completion guard: it stored a second log row, appended
// another JOB-ERRORED, and re-sent the reviewer email. The artifacts it carried were already on file,
// so the repeat is absorbed: stored in place, announced once, and still answered with a success the
// sender has nothing to retry against.
test.skipIf(!s3Available)('absorbs a repeated log-only (errored) delivery without announcing it twice', async () => {
    const org = await insertTestOrg()
    const { jobIds } = await insertTestStudyData({ org })
    const jobId = jobIds[0]

    const post = () => {
        const formData = new FormData()
        formData.append('log', new File([new TextEncoder().encode('boom')], 'log.txt', { type: 'text/plain' }))
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

// The scan and packaging steps also record JOB-ERRORED, with their own log types. A repeat is decided
// by what this delivery carried, not by the job's status history, so one of those must not block a
// real delivery.
test.skipIf(!s3Available)('a prior scan/packaging JOB-ERRORED does not block a results delivery', async () => {
    const org = await insertTestOrg()
    const { jobIds } = await insertTestStudyData({ org })
    const jobId = jobIds[0]

    await db.insertInto('jobStatusChange').values({ studyJobId: jobId, status: 'JOB-ERRORED' }).execute()

    const formData = new FormData()
    formData.append('result', new File([new Uint8Array([1, 2, 3])], 'r.txt', { type: 'text/plain' }))
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

// The run log is this route's first write, so a delivery can leave one behind and still fail before
// the status insert and the reviewer email (a transient S3 error on the results upload, or the
// process dying in between). The TOA retries that, and the retry has to be able to finish the
// delivery: the results it carries are new to the job, so it is not a repeat and completes normally.
test.skipIf(!s3Available)('completes a retried delivery whose log was already stored', async () => {
    const org = await insertTestOrg()
    const { studyId, jobIds } = await insertTestStudyData({ org })
    const jobId = jobIds[0]

    const jobPath = pathForStudyJob({ orgSlug: org.slug, studyId, studyJobId: jobId })
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
    formData.append('log', new File([new TextEncoder().encode('boom')], 'log.txt', { type: 'text/plain' }))
    formData.append('result', new File([new Uint8Array([1, 2, 3])], 'r.txt', { type: 'text/plain' }))
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

test.skipIf(!s3Available)('uploading logs', async () => {
    const org = await insertTestOrg()
    const logContents = 'long line one\nlog line two\n'
    const encoder = new TextEncoder()
    const file = new File([encoder.encode(logContents)], 'testfile.log', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('log', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'fileType'])
        .where('studyJobFile.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({
        path: expect.any(String),
        fileType: 'ENCRYPTED-CODE-RUN-LOG',
    })

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})
