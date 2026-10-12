import {
    db,
    describe,
    expect,
    insertTestCodeEnv,
    insertTestOrg,
    insertTestStudyJobData,
    it,
} from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import { selectCodeEnvSnapshot } from '@/server/db/queries'
import { backfillCodeEnvSnapshot } from './migrations/1787400000000_study_code_env_snapshot'

const snapshotOf = async (studyId: string) =>
    (await db.selectFrom('study').select('codeEnvSnapshot').where('id', '=', studyId).executeTakeFirstOrThrow())
        .codeEnvSnapshot

describe('study_code_env_snapshot migration', () => {
    // Pins the backfill's own copy of the rule and fields against the runtime snapshot, so a study
    // backfilled at deploy matches one created afterwards.
    it('gives an existing study the code env a new study would get', async () => {
        const org = await insertTestOrg()
        const older = await insertTestCodeEnv({ orgId: org.id, language: 'R', url: 'example.com/r:older' })
        await db
            .updateTable('orgCodeEnv')
            .set({ createdAt: new Date(Date.now() - 60_000) })
            .where('id', '=', older.id)
            .execute()
        const current = await insertTestCodeEnv({
            orgId: org.id,
            language: 'R',
            url: 'example.com/r:current',
            commandLines: { r: 'Rscript %f' },
            environment: [{ name: 'K', value: 'v' }],
        })
        await db
            .updateTable('orgCodeEnv')
            .set({ dataSourceType: 'postgres', sampleDataPath: 'sample' })
            .where('id', '=', current.id)
            .execute()
        await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: true, url: 'example.com/r:testing' })
        const { study } = await insertTestStudyJobData({ org, language: 'R' })
        expect(await snapshotOf(study.id)).toBeNull()

        await backfillCodeEnvSnapshot(db as unknown as Kysely<unknown>, study.id)

        const expected = await selectCodeEnvSnapshot(db, study.id).executeTakeFirstOrThrow()
        expect(expected.id).toBe(current.id)
        expect(await snapshotOf(study.id)).toEqual(expected)
    })

    it('leaves a study whose language has no code env without a snapshot', async () => {
        const org = await insertTestOrg()
        await insertTestCodeEnv({ orgId: org.id, language: 'R' })
        const { study } = await insertTestStudyJobData({ org, language: 'PYTHON' })

        await backfillCodeEnvSnapshot(db as unknown as Kysely<unknown>, study.id)

        expect(await snapshotOf(study.id)).toBeNull()
    })
})
