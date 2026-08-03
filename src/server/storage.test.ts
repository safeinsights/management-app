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
    const delivery = await storeStudyEncryptedLogFile(info, logFile('late-redelivery.zip'), 'ENCRYPTED-CODE-RUN-LOG')

    // `stored: false` is what lets the route say the artifacts were dropped rather than received.
    expect(delivery).toMatchObject({ isNew: false, stored: false })
    expect(vi.mocked(storeS3File).mock.calls.length).toBe(uploadsBefore)
    const rows = await jobLogRows(info.studyJobId)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('encrypted-logs.zip')
})

// Sharing does not wait for a round to close: a reviewer approving CODE re-wraps keys for researchers
// alongside CODE-APPROVED, and the round stays open afterwards. So a round-status-only guard left a
// scan log that had already been shared replaceable by a delayed scanner delivery, which would leave
// the researcher holding keys wrapped against bytes that no longer exist.
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

    expect(redelivery).toMatchObject({ isNew: false, stored: false })
    expect(vi.mocked(storeS3File).mock.calls.length).toBe(uploadsBefore)
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
// from that era can hold a log row on the path a result now uses. A delivery claims its own slot
// (job + path + type) and leaves the other row alone: retyping it in place would silently relabel a
// different artifact, and the slot key is what the unique index enforces. Unreachable for jobs still
// receiving deliveries, since those runs finished long before the paths were split.
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
        // By name, not fileType: ordering an enum column follows its declaration order, not alphabet.
        .orderBy('name', 'asc')
        .execute()
    expect(rows).toEqual([
        { fileType: 'ENCRYPTED-CODE-RUN-LOG', name: 'encrypted-results.zip' },
        { fileType: 'ENCRYPTED-RESULT', name: 'results.zip' },
    ])
})

// Two deliveries can pass the existing-row lookup before either inserts. The unique index turns the
// loser's insert into a violation instead of a duplicate row, and it is recovered as the repeat it
// effectively is: one row, and only one caller told the outcome was new.
test('collapses two concurrent first deliveries into one row', async () => {
    const info = await setupJob()

    const results = await Promise.all([
        storeStudyEncryptedLogFile(info, logFile('first.zip'), 'ENCRYPTED-CODE-RUN-LOG'),
        storeStudyEncryptedLogFile(info, logFile('second.zip'), 'ENCRYPTED-CODE-RUN-LOG'),
    ])

    expect(await jobLogRows(info.studyJobId)).toHaveLength(1)
    expect(results.filter((r) => r.isNew)).toHaveLength(1)
    expect(results.every((r) => r.stored)).toBe(true)
})
