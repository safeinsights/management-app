import { expect, test } from 'vitest'
import { db } from '@/database'
import { insertTestJobInfo, testUploadFile } from '@/tests/unit.helpers'
import { pathForStudyJob } from '@/lib/paths'
import { discardStaleScanLogs, storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from './storage'
import { fetchS3File } from './aws'

// S3 is not mocked here. tests/unit.helpers pulls @/server/aws into the module graph before a
// vi.mock in this file can intercept it, so a mock would silently never apply — which is how the
// call-count assertions this file used to make passed against a function that was never called.
// The suite talks to the local SeaweedFS instead, which lets these assert on real object state.
async function objectExists(path: string) {
    try {
        await fetchS3File(path)
        return true
    } catch {
        return false
    }
}

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

    const delivery = await storeStudyEncryptedLogFile(info, logFile('late-redelivery.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    expect(delivery.stored).toBe(false)
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

    const redelivery = await storeStudyEncryptedLogFile(info, logFile('rescanned.zip'), 'ENCRYPTED-SECURITY-SCAN-LOG')

    expect(redelivery.stored).toBe(false)
    // The row keeps its original name, so the stored copy the recipient's keys were wrapped from
    // was left in place rather than replaced.
    const rows = await db.selectFrom('studyJobFile').select('name').where('id', '=', stored.id).execute()
    expect(rows).toEqual([{ name: 'encrypted-logs.zip' }])
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

async function scanLogRows(studyJobId: string) {
    return await db
        .selectFrom('studyJobFile')
        .select(['id', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'ENCRYPTED-SECURITY-SCAN-LOG')
        .execute()
}

test("discards the previous round's scan log row and its object", async () => {
    const info = await setupJob()
    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-SECURITY-SCAN-LOG')
    const [{ path }] = await scanLogRows(info.studyJobId)
    expect(await objectExists(path)).toBe(true)

    await discardStaleScanLogs(info.studyJobId)

    expect(await scanLogRows(info.studyJobId)).toHaveLength(0)
    // The object has to go with the row, or the next delivery takes storeJobFile's insert path and
    // overwrites it without consulting unreplaceableReason.
    expect(await objectExists(path)).toBe(false)
})

test('leaves a scan log whose keys are already wrapped for recipients', async () => {
    const info = await setupJob()
    const stored = await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-SECURITY-SCAN-LOG')
    await db
        .insertInto('studyJobFileRecipientKey')
        .values({
            studyJobFileId: stored.id,
            filePath: 'scan-log.txt',
            fingerprint: 'test-fingerprint',
            crypt: 'test-crypt',
        })
        .execute()

    await discardStaleScanLogs(info.studyJobId)

    const [remaining] = await scanLogRows(info.studyJobId)
    expect(remaining).toBeDefined()
    // Deleting the object would strand the recipient: their wrapped keys stop decrypting.
    expect(await objectExists(remaining.path)).toBe(true)
})

test('leaves code and result artifacts alone', async () => {
    const info = await setupJob()
    await storeStudyEncryptedLogFile(info, logFile(), 'ENCRYPTED-CODE-RUN-LOG')
    await storeStudyEncryptedResultsFile(info, logFile('results.zip'))

    await discardStaleScanLogs(info.studyJobId)

    expect(await jobLogRows(info.studyJobId)).toHaveLength(1)
    const results = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', info.studyJobId)
        .where('fileType', '=', 'ENCRYPTED-RESULT')
        .execute()
    expect(results).toHaveLength(1)
})
