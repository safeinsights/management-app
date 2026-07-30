import { expect, test, vi } from 'vitest'
import { db } from '@/database'
import { insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { pathForStudyJob } from '@/lib/paths'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from './storage'
import { storeS3File } from './aws'

vi.mock('@/server/aws', () => ({
    storeS3File: vi.fn(),
    fetchS3File: vi.fn(),
    signedUrlForFile: vi.fn(),
}))

const logFile = (name = 'encrypted-logs.zip') =>
    new File([new TextEncoder().encode('boom')], name, { type: 'application/zip' })

async function jobLogRows(studyJobId: string) {
    return await db
        .selectFrom('studyJobFile')
        .select(['id', 'name'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
        .execute()
}

async function setupJob() {
    const org = await insertTestOrg()
    const { studyId, jobIds } = await insertTestStudyData({ org })
    return { orgSlug: org.slug, studyId, studyJobId: jobIds[0] }
}

// The storage path is derived from the job and the artifact type, so a re-delivered webhook
// overwrites the same S3 object. Before OTTER-642 it also inserted a second row pointing at that
// object, which surfaced as the log listed twice for both the reviewer and the researcher.
test('storing the same artifact twice updates the row instead of adding a duplicate', async () => {
    const info = await setupJob()

    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')
    await storeStudyEncryptedLogFile(info, logFile('re-delivered.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    const rows = await jobLogRows(info.studyJobId)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('re-delivered.zip')
})

// Once the round is decided the artifact has been released and the researcher's per-file keys are
// wrapped against the AES keys of that exact ciphertext. Replacing the object would leave a released
// file that no longer decrypts, so a late re-delivery is ignored outright.
test('ignores a repeat delivery once the round has been decided', async () => {
    const info = await setupJob()
    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')
    await db.insertInto('jobStatusChange').values({ studyJobId: info.studyJobId, status: 'FILES-APPROVED' }).execute()

    const uploadsBefore = vi.mocked(storeS3File).mock.calls.length
    await storeStudyEncryptedLogFile(info, logFile('late-redelivery.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    expect(vi.mocked(storeS3File).mock.calls.length).toBe(uploadsBefore)
    const rows = await jobLogRows(info.studyJobId)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('encrypted-logs.zip')
})

// A closed round only protects artifacts it already has: dropping a never-seen one would lose data
// with nothing released to protect.
test('still stores a first-time artifact after the round has been decided', async () => {
    const info = await setupJob()
    await db.insertInto('jobStatusChange').values({ studyJobId: info.studyJobId, status: 'FILES-APPROVED' }).execute()

    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')

    expect(await jobLogRows(info.studyJobId)).toHaveLength(1)
})

// Run logs and results were both written to results/encrypted-results.zip until mid-2025, so a job
// from that era can hold a log row on the path a result now uses. Matching the artifact type as well
// as the path keeps a delivery from rewriting that row into something it is not.
test('does not repurpose a legacy row of another type that shares the results path', async () => {
    const info = await setupJob()
    const legacyLogPath = `${pathForStudyJob(info)}/results/encrypted-results.zip`
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: info.studyJobId,
            path: legacyLogPath,
            name: 'encrypted-results.zip',
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
        })
        .execute()

    await storeStudyEncryptedResultsFile(info, logFile('results.zip'))

    const rows = await db
        .selectFrom('studyJobFile')
        .select(['fileType', 'name'])
        .where('studyJobId', '=', info.studyJobId)
        .where('path', '=', legacyLogPath)
        .execute()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.fileType === 'ENCRYPTED-CODE-RUN-LOG')?.name).toBe('encrypted-results.zip')
    expect(rows.find((r) => r.fileType === 'ENCRYPTED-RESULT')?.name).toBe('results.zip')
})
