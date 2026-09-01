import { expect, test, vi } from 'vitest'
import { db } from '@/database'
import { insertTestJobInfo, testUploadFile } from '@/tests/unit.helpers'
import { pathForStudyJob } from '@/lib/paths'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from './storage'
import { storeS3File } from './aws'

vi.mock('@/server/aws', () => ({
    storeS3File: vi.fn(),
    fetchS3File: vi.fn(),
    signedUrlForFile: vi.fn(),
}))

const logFile = (name = 'encrypted-logs.zip') => testUploadFile(name)

async function jobLogRows(studyJobId: string) {
    return await db
        .selectFrom('studyJobFile')
        .select(['id', 'name'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
        .execute()
}

const setupJob = async () => (await insertTestJobInfo()).jobInfo

test('storing the same artifact twice updates the row instead of adding a duplicate', async () => {
    const info = await setupJob()

    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')
    await storeStudyEncryptedLogFile(info, logFile('re-delivered.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    const rows = await jobLogRows(info.studyJobId)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('re-delivered.zip')
})

test('ignores a repeat delivery once the round has been decided', async () => {
    const info = await setupJob()
    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')
    await db.insertInto('jobStatusChange').values({ studyJobId: info.studyJobId, status: 'FILES-APPROVED' }).execute()

    const uploadsBefore = vi.mocked(storeS3File).mock.calls.length
    const delivery = await storeStudyEncryptedLogFile(info, logFile('late-redelivery.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    expect(delivery.stored).toBe(false)
    expect(vi.mocked(storeS3File).mock.calls.length).toBe(uploadsBefore)
    const rows = await jobLogRows(info.studyJobId)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('encrypted-logs.zip')
})

test('refuses to replace an artifact whose keys are already shared on an open round', async () => {
    const info = await setupJob()
    const stored = await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-SECURITY-SCAN-LOG')
    await db.insertInto('jobStatusChange').values({ studyJobId: info.studyJobId, status: 'CODE-APPROVED' }).execute()
    await db
        .insertInto('studyJobFileRecipientKey')
        .values({
            studyJobFileId: stored.id,
            filePath: 'scan-log.txt',
            fingerprint: 'test-fingerprint',
            crypt: 'test-crypt',
        })
        .execute()

    const uploadsBefore = vi.mocked(storeS3File).mock.calls.length
    const redelivery = await storeStudyEncryptedLogFile(info, logFile('rescanned.zip'), 'ENCRYPTED-SECURITY-SCAN-LOG')

    expect(redelivery.stored).toBe(false)
    expect(vi.mocked(storeS3File).mock.calls.length).toBe(uploadsBefore)
})

test('still stores a first-time artifact after the round has been decided', async () => {
    const info = await setupJob()
    await db.insertInto('jobStatusChange').values({ studyJobId: info.studyJobId, status: 'FILES-APPROVED' }).execute()

    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')

    expect(await jobLogRows(info.studyJobId)).toHaveLength(1)
})

// Logs and results shared results/encrypted-results.zip until mid-2025, so a job from that era can
// hold a log row on the path a result now uses.
test('leaves a legacy row of another type on the results path alone', async () => {
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
        .orderBy('name', 'asc')
        .execute()
    expect(rows).toEqual([
        { fileType: 'ENCRYPTED-CODE-RUN-LOG', name: 'encrypted-results.zip' },
        { fileType: 'ENCRYPTED-RESULT', name: 'results.zip' },
    ])
})

test('collapses two concurrent first deliveries into one row', async () => {
    const info = await setupJob()

    const results = await Promise.all([
        storeStudyEncryptedLogFile(info, logFile('first.zip'), 'ENCRYPTED-CODE-RUN-LOG'),
        storeStudyEncryptedLogFile(info, logFile('second.zip'), 'ENCRYPTED-CODE-RUN-LOG'),
    ])

    expect(await jobLogRows(info.studyJobId)).toHaveLength(1)
    expect(results.every((r) => r.stored)).toBe(true)
})
