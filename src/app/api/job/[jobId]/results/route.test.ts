import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { db } from '@/database'
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
