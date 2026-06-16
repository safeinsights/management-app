import { describe, expect, test } from 'vitest'
import { db, insertTestOrg, insertTestStudyJobData, insertTestUser } from '@/tests/unit.helpers'
import { ActionFailure } from '@/lib/errors'
import { insertSharedFileKeys } from './results-sharing'

// Enclave test users are seeded with fingerprint 'testFingerprint1' (tests/unit.helpers.tsx),
// and insertTestStudyJobData sets study.submittedByOrgId = org.id, so that fingerprint is a
// valid lab recipient for the job.
const LAB_FINGERPRINT = 'testFingerprint1'

async function insertSharedFileScenario() {
    const org = await insertTestOrg()
    const { user: approver } = await insertTestUser({ org })
    const { job } = await insertTestStudyJobData({ org })

    const file = await db
        .insertInto('studyJobFile')
        .values({
            path: 'results/encrypted-results.zip',
            name: 'encrypted-results.zip',
            studyJobId: job.id,
            fileType: 'ENCRYPTED-RESULT',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { org, approver, job, file }
}

const selectKeyRows = (fileId: string) =>
    db.selectFrom('studyJobFileKey').select(['fingerprint', 'crypt']).where('studyJobFileId', '=', fileId).execute()

// Approval is recorded by the caller as a job-level FILES-APPROVED status change, not here.
// These tests cover only the access mechanism: persisting validated wrapped-key rows.
describe('insertSharedFileKeys', () => {
    test('persists wrapped keys for a valid lab recipient', async () => {
        const { job, file } = await insertSharedFileScenario()

        await insertSharedFileKeys(db, job.id, [
            {
                studyJobFileId: file.id,
                filePath: 'results.csv',
                keys: [{ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' }],
            },
        ])

        const keyRows = await selectKeyRows(file.id)
        expect(keyRows).toHaveLength(1)
        expect(keyRows[0]).toMatchObject({ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' })
    })

    test('rejects a fingerprint that is not a lab recipient and writes nothing', async () => {
        const { job, file } = await insertSharedFileScenario()

        await expect(
            insertSharedFileKeys(db, job.id, [
                {
                    studyJobFileId: file.id,
                    filePath: 'results.csv',
                    keys: [{ fingerprint: 'not-a-lab-key', crypt: 'bogus' }],
                },
            ]),
        ).rejects.toThrow(ActionFailure)

        expect(await selectKeyRows(file.id)).toHaveLength(0)
    })

    test('is idempotent: re-running the same share does not duplicate key rows', async () => {
        const { job, file } = await insertSharedFileScenario()
        const sharedFiles = [
            {
                studyJobFileId: file.id,
                filePath: 'results.csv',
                keys: [{ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' }],
            },
        ]

        await insertSharedFileKeys(db, job.id, sharedFiles)
        await insertSharedFileKeys(db, job.id, sharedFiles)

        expect(await selectKeyRows(file.id)).toHaveLength(1)
    })
})
