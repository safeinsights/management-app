import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestOrg, insertTestStudyData, readTestSupportFile } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { db } from '@/database'
import { sendResultsReadyForReviewEmail } from '@/server/mailer'
import { fetchFileContents } from '@/server/storage'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'

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

// TOA uploads a ResultsWriter zip; ingest decomposes it into per-file rows + wrapped keys.
async function buildEncryptedZip(fileName: string, content: string): Promise<File> {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    const buf = Buffer.from(content, 'utf-8')
    await writer.addFile(fileName, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const zip = await writer.generate()
    return new File([zip], 'encrypted.zip', { type: 'application/zip' })
}

// These exercise the real S3 round-trip (storeStudyEncrypted*/fetchFileContents),
// so they skip when SeaweedFS isn't running locally; on CI s3.helpers throws instead.
test.skipIf(!s3Available)('uploading results', async () => {
    const org = await insertTestOrg()

    const formData = new FormData()
    formData.append('result', await buildEncryptedZip('output.csv', 'a,b\n1,2'))

    const req = new Request('http://localhost', { method: 'PUT', body: formData })

    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['id', 'path', 'name', 'fileType', 'iv'])
        .where('studyJobFile.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({ name: 'output.csv', fileType: 'ENCRYPTED-RESULT' })
    expect(sr.iv).toBeTruthy()

    // The manifest's recipient key became a study_job_file_key row.
    const wrappedKeys = await db
        .selectFrom('studyJobFileKey')
        .select('crypt')
        .where('studyJobFileId', '=', sr.id)
        .execute()
    expect(wrappedKeys.length).toBeGreaterThan(0)

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})

test.skipIf(!s3Available)('uploading logs', async () => {
    const org = await insertTestOrg()

    const formData = new FormData()
    formData.append('log', await buildEncryptedZip('run.log', 'log line one\nlog line two\n'))

    const req = new Request('http://localhost', { method: 'PUT', body: formData })

    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'name', 'fileType', 'iv'])
        .where('studyJobFile.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({ name: 'run.log', fileType: 'ENCRYPTED-CODE-RUN-LOG' })
    expect(sr.iv).toBeTruthy()

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})
