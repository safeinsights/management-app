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
            path: 'results/encrypted/results.csv',
            name: 'results.csv',
            studyJobId: job.id,
            fileType: 'ENCRYPTED-RESULT',
            iv: 'aXY=',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { org, approver, job, file }
}

const selectKeyRows = (fileId: string) =>
    db.selectFrom('studyJobFileKey').select(['fingerprint', 'crypt']).where('studyJobFileId', '=', fileId).execute()

const selectApproval = (fileId: string) =>
    db
        .selectFrom('studyJobFile')
        .select(['approvedAt', 'approvedByUserId'])
        .where('id', '=', fileId)
        .executeTakeFirstOrThrow()

describe('insertSharedFileKeys', () => {
    test('persists wrapped keys and records the approval on the file', async () => {
        const { approver, job, file } = await insertSharedFileScenario()

        await insertSharedFileKeys(
            db,
            job.id,
            [{ studyJobFileId: file.id, keys: [{ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' }] }],
            approver.id,
        )

        const keyRows = await selectKeyRows(file.id)
        expect(keyRows).toHaveLength(1)
        expect(keyRows[0]).toMatchObject({ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' })

        const approval = await selectApproval(file.id)
        expect(approval.approvedAt).toBeInstanceOf(Date)
        expect(approval.approvedByUserId).toBe(approver.id)
    })

    test('rejects a fingerprint that is not a lab recipient and writes nothing', async () => {
        const { approver, job, file } = await insertSharedFileScenario()

        await expect(
            insertSharedFileKeys(
                db,
                job.id,
                [{ studyJobFileId: file.id, keys: [{ fingerprint: 'not-a-lab-key', crypt: 'bogus' }] }],
                approver.id,
            ),
        ).rejects.toThrow(ActionFailure)

        expect(await selectKeyRows(file.id)).toHaveLength(0)
        const approval = await selectApproval(file.id)
        expect(approval.approvedAt).toBeNull()
    })

    test('is idempotent: re-running the same share does not duplicate key rows', async () => {
        const { approver, job, file } = await insertSharedFileScenario()
        const sharedFiles = [
            { studyJobFileId: file.id, keys: [{ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' }] },
        ]

        await insertSharedFileKeys(db, job.id, sharedFiles, approver.id)
        await insertSharedFileKeys(db, job.id, sharedFiles, approver.id)

        expect(await selectKeyRows(file.id)).toHaveLength(1)
    })

    test('never overwrites an earlier approval timestamp or approver', async () => {
        const { org, approver, job, file } = await insertSharedFileScenario()
        const sharedFiles = [
            { studyJobFileId: file.id, keys: [{ fingerprint: LAB_FINGERPRINT, crypt: 'wrapped-key' }] },
        ]

        await insertSharedFileKeys(db, job.id, sharedFiles, approver.id)
        const first = await selectApproval(file.id)

        const { user: secondApprover } = await insertTestUser({ org })
        await insertSharedFileKeys(db, job.id, sharedFiles, secondApprover.id)

        const second = await selectApproval(file.id)
        expect(second.approvedAt?.getTime()).toBe(first.approvedAt?.getTime())
        expect(second.approvedByUserId).toBe(approver.id)
    })
})
