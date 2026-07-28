import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    readTestSupportFile,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { ResultsReader } from 'si-encryption/job-results/reader'
import type { MinimalJobInfo } from '@/lib/types'
import type { FileType } from '@/database/types'
import { PATCH } from './route'

const storedFiles = vi.hoisted(() => new Map<string, Blob>())

// The upload is stubbed at the storage layer rather than at @/server/aws: the helper
// under test reaches S3 through @/server/storage, and mocking the lower module leaves
// storage.ts bound to the real S3 client. Everything below the upload is left real, so
// the study_job_file row is still written and asserted against the database.
vi.mock('@/server/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/storage')>()
    const { db } = await import('@/database')
    const { pathForStudyJob } = await import('@/lib/paths')

    // Mirrors storeJobFile: capture the bytes in place of the S3 PUT, then insert the row.
    const store = async (info: MinimalJobInfo, path: string, file: File, fileType: FileType) => {
        storedFiles.set(path, new Blob([await file.arrayBuffer()]))
        return await db
            .insertInto('studyJobFile')
            .values({ path, name: file.name, studyJobId: info.studyJobId, fileType })
            .executeTakeFirstOrThrow()
    }

    // Plain functions, not vi.fn: vitest.config sets mockReset, which would strip these
    // implementations before each test and silently skip the row insert.
    return {
        ...actual,
        storeStudyEncryptedResultsFile: (info: MinimalJobInfo, file: File) =>
            store(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT'),
        storeStudyEncryptedLogFile: (info: MinimalJobInfo, file: File, fileType: FileType) =>
            store(info, `${pathForStudyJob(info)}/results/${fileType.toLowerCase()}.zip`, file, fileType),
    }
})

beforeEach(() => {
    storedFiles.clear()
})

async function authenticateAsSiAdmin(options: { isSiAdmin: boolean } = { isSiAdmin: true }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

/**
 * A study owned by a qa- researcher, in an enclave org with a real keypair enrolled —
 * insertTestUser only creates user_public_key rows for enclave orgs, and reviewers in
 * that org are who an uploaded artifact is encrypted for.
 *
 * studyStatus is DRAFT so a test asserting a move to APPROVED starts somewhere else.
 */
async function insertQaStudy() {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const { user } = await insertTestUser({ org, email: qaEmail(), useRealKeys: true })
    const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })
    return { org, user, study, job }
}

const patchStatus = (studyId: string, form: FormData) =>
    PATCH(new Request(`http://localhost/api/qa/studies/${studyId}/status`, { method: 'PATCH', body: form }), {
        params: Promise.resolve({ studyId }),
    })

const formWith = (fields: Record<string, string | File>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return form
}

const textFile = (name: string, contents: string) => new File([contents], name, { type: 'text/plain' })

describe('PATCH /api/qa/studies/{studyId}/status', () => {
    it('sets the study status', async () => {
        await authenticateAsSiAdmin()
        const { study } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ studyStatus: 'APPROVED' }))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ studyId: study.id, studyStatus: 'APPROVED' })
        const row = await db.selectFrom('study').select(['status']).where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(row.status).toBe('APPROVED')
    })

    it('appends a job status to the latest job', async () => {
        await authenticateAsSiAdmin()
        const { study, job } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ jobStatus: 'RUN-COMPLETE' }))

        expect(response.status).toBe(200)
        const changes = await db
            .selectFrom('jobStatusChange')
            .select(['status'])
            .where('studyJobId', '=', job.id)
            .execute()
        expect(changes.map((c) => c.status)).toContain('RUN-COMPLETE')
    })

    it('sets both statuses in one request', async () => {
        await authenticateAsSiAdmin()
        const { study } = await insertQaStudy()

        const response = await patchStatus(
            study.id,
            formWith({ studyStatus: 'PENDING-REVIEW', jobStatus: 'JOB-RUNNING' }),
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ studyStatus: 'PENDING-REVIEW', jobStatus: 'JOB-RUNNING' })
    })

    // The endpoint takes plaintext and encrypts it, so the stored object must be a real
    // encrypted envelope the researcher's key can open — not the bytes that were posted.
    it('encrypts an attached result for the reviewing org', async () => {
        await authenticateAsSiAdmin()
        const { study, job } = await insertQaStudy()

        const response = await patchStatus(
            study.id,
            formWith({ jobStatus: 'RUN-COMPLETE', result: textFile('results.csv', 'a,b\n1,2\n') }),
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.files).toEqual([{ key: 'result', fileType: 'ENCRYPTED-RESULT', name: 'results.csv' }])

        // The row names the encrypted envelope, as in production; the plaintext filename
        // survives inside the manifest, which is what the reader below recovers.
        const file = await db
            .selectFrom('studyJobFile')
            .select(['path', 'fileType', 'name'])
            .where('studyJobId', '=', job.id)
            .where('fileType', '=', 'ENCRYPTED-RESULT')
            .executeTakeFirstOrThrow()
        expect(file.name).toBe('encrypted-results.zip')

        // Round-trips with the reviewer's key: proves the endpoint stored real ciphertext
        // the review UI can open, not the plaintext that was posted.
        const stored = storedFiles.get(file.path)
        if (!stored) throw new Error(`nothing uploaded to ${file.path}`)
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const privateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
        const reader = new ResultsReader(stored, privateKey, await fingerprintKeyData(publicKey))
        const decrypted = await reader.extractFiles()

        expect(decrypted).toHaveLength(1)
        expect(decrypted[0].path).toBe('results.csv')
        expect(new TextDecoder().decode(new Uint8Array(decrypted[0].contents))).toBe('a,b\n1,2\n')
    })

    it('stores an attached log as an encrypted code-run log', async () => {
        await authenticateAsSiAdmin()
        const { study, job } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ log: textFile('run.log', 'it worked\n') }))

        expect(response.status).toBe(200)
        const file = await db
            .selectFrom('studyJobFile')
            .select(['fileType'])
            .where('studyJobId', '=', job.id)
            .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
            .executeTakeFirst()
        expect(file).toBeTruthy()
    })

    it('returns 400 when the reviewing org has no keys to encrypt for', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const response = await patchStatus(study.id, formWith({ result: textFile('r.csv', 'x') }))

        expect(response.status).toBe(400)
        expect((await response.json()).error).toContain('public keys')
    })

    // A study has no job until work begins, so a fresh QA study needs one opened before a
    // job status or artifact has anywhere to live.
    it('opens a round job when the study has none', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail(), useRealKeys: true })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const response = await patchStatus(
            study.id,
            formWith({ jobStatus: 'RUN-COMPLETE', result: textFile('results.csv', 'a,b\n1,2\n') }),
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ jobCreated: true })
        expect(body.studyJobId).toBeTruthy()

        const changes = await db
            .selectFrom('jobStatusChange')
            .select(['status'])
            .where('studyJobId', '=', body.studyJobId)
            .execute()
        // INITIATED comes from opening the round; RUN-COMPLETE is what was requested.
        expect(changes.map((c) => c.status)).toEqual(expect.arrayContaining(['INITIATED', 'RUN-COMPLETE']))

        const file = await db
            .selectFrom('studyJobFile')
            .select(['fileType'])
            .where('studyJobId', '=', body.studyJobId)
            .executeTakeFirst()
        expect(file?.fileType).toBe('ENCRYPTED-RESULT')
    })

    // Only mint a job when something actually needs one; a status-only call should leave
    // the study job-less rather than fabricating an empty round.
    it('does not open a job when only the study status is set', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail(), useRealKeys: true })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const response = await patchStatus(study.id, formWith({ studyStatus: 'APPROVED' }))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ studyStatus: 'APPROVED', studyJobId: null, jobCreated: false })
        const jobs = await db.selectFrom('studyJob').select(['id']).where('studyId', '=', study.id).execute()
        expect(jobs).toHaveLength(0)
    })

    it('reuses the existing job rather than opening another', async () => {
        await authenticateAsSiAdmin()
        const { study, job } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ jobStatus: 'RUN-COMPLETE' }))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ studyJobId: job.id, jobCreated: false })
    })

    it('returns 400 for an unknown status value', async () => {
        await authenticateAsSiAdmin()
        const { study } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ studyStatus: 'NOT-A-STATUS' }))

        expect(response.status).toBe(400)
    })

    it('returns 400 when nothing was requested', async () => {
        await authenticateAsSiAdmin()
        const { study } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({}))

        expect(response.status).toBe(400)
    })

    it('returns 404 for an unknown study', async () => {
        await authenticateAsSiAdmin()

        const response = await patchStatus(faker.string.uuid(), formWith({ studyStatus: 'APPROVED' }))

        expect(response.status).toBe(404)
    })

    // Runs on production, so a study owned by a real researcher must be untouchable.
    it('returns 403 when the study researcher is not a qa account', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: 'real.person@corp.com' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        const response = await patchStatus(study.id, formWith({ studyStatus: 'APPROVED' }))

        expect(response.status).toBe(403)
        const row = await db.selectFrom('study').select(['status']).where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(row.status).toBe('DRAFT')
    })

    it('rejects a caller who is not an SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: false })
        const { study } = await insertQaStudy()

        const response = await patchStatus(study.id, formWith({ studyStatus: 'APPROVED' }))

        expect(response.status).toBe(403)
        const row = await db.selectFrom('study').select(['status']).where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(row.status).toBe('DRAFT')
    })

    it('audits the change against the acting admin', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const { study } = await insertQaStudy()

        await patchStatus(study.id, formWith({ studyStatus: 'APPROVED', jobStatus: 'RUN-COMPLETE' }))

        const entries = await db
            .selectFrom('audit')
            .select(['eventType', 'recordType', 'userId', 'metadata'])
            .where('recordId', '=', study.id)
            .execute()

        expect(entries.length).toBeGreaterThanOrEqual(2)
        expect(entries[0]).toMatchObject({ eventType: 'UPDATED', recordType: 'STUDY', userId: admin.id })
        const outcomes = entries.map((entry) => (entry.metadata as { outcome?: string }).outcome)
        expect(outcomes).toContain('attempted')
        expect(outcomes).toContain('succeeded')
    })
})
