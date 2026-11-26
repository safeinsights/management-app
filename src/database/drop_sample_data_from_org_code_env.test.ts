import { sql, type Kysely } from 'kysely'
import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import { stripDataSourceTypeFromSnapshots } from './migrations/1794943088360_drop_sample_data_from_org_code_env'

const SNAPSHOT = {
    id: '01990000-0000-7000-8000-000000000000',
    language: 'R',
    url: 'example.com/r:1',
    settings: { environment: [{ name: 'K', value: 'v' }] },
    commandLines: { r: 'Rscript %f' },
}

const rawSnapshot = async (studyId: string) => {
    const row = await db
        .selectFrom('study')
        .select('codeEnvSnapshot')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()
    return row.codeEnvSnapshot as Record<string, unknown> | null
}

describe('drop_sample_data_from_org_code_env migration', () => {
    it('strips dataSourceType from study snapshots and leaves the rest alone', async () => {
        const { study: withKey } = await insertTestStudyOnly({})
        const { study: withoutSnapshot } = await insertTestStudyOnly({})
        // The pre-change shape, which the current CodeEnvSnapshot type no longer allows.
        await sql`UPDATE study SET code_env_snapshot = ${JSON.stringify({ ...SNAPSHOT, dataSourceType: 'athena' })}::jsonb WHERE id = ${withKey.id}`.execute(
            db,
        )
        await db.updateTable('study').set({ codeEnvSnapshot: null }).where('id', '=', withoutSnapshot.id).execute()

        await stripDataSourceTypeFromSnapshots(db as unknown as Kysely<unknown>)

        expect(await rawSnapshot(withKey.id)).toEqual(SNAPSHOT)
        expect(await rawSnapshot(withoutSnapshot.id)).toBeNull()
    })
})
