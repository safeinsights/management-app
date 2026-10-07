import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import type { WorkspaceFileAction } from '@/database/types'
import { backfillLabEditedAt } from './migrations/1787500000000_study_lab_edited_at'

const recordActivity = (studyId: string, userId: string, action: WorkspaceFileAction, createdAt: Date) =>
    db.insertInto('workspaceFileActivity').values({ studyId, userId, action, fileName: 'main.r', createdAt }).execute()

const labEditedAtOf = async (studyId: string) =>
    (await db.selectFrom('study').select('labEditedAt').where('id', '=', studyId).executeTakeFirstOrThrow())
        .labEditedAt

describe('study_lab_edited_at migration', () => {
    it('backfills the newest upload and ignores IDE edit clicks', async () => {
        const { study } = await insertTestStudyOnly()
        const olderUpload = new Date('2026-09-01T10:00:00Z')
        const newerUpload = new Date('2026-09-02T10:00:00Z')
        await recordActivity(study.id, study.researcherId, 'UPLOADED', olderUpload)
        await recordActivity(study.id, study.researcherId, 'UPLOADED', newerUpload)
        await recordActivity(study.id, study.researcherId, 'EDITED_IN_IDE', new Date('2026-09-03T10:00:00Z'))

        await backfillLabEditedAt(db as unknown as Kysely<unknown>)

        expect(await labEditedAtOf(study.id)).toEqual(newerUpload)
    })

    it('leaves a study without uploads empty', async () => {
        const { study } = await insertTestStudyOnly()

        await backfillLabEditedAt(db as unknown as Kysely<unknown>)

        expect(await labEditedAtOf(study.id)).toBeNull()
    })
})
