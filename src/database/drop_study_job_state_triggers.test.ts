import { db, describe, expect, it } from '@/tests/unit.helpers'
import { sql, type Kysely } from 'kysely'
import { down, up } from './migrations/1793904779051_drop_study_job_state_triggers'

const migration = db as unknown as Kysely<unknown>

const installed = async () => {
    const { rows } = await sql<{ name: string }>`
        SELECT tgname AS name FROM pg_trigger WHERE tgname IN ('keep_study_job_state', 'number_study_job_round')
        UNION ALL
        SELECT proname FROM pg_proc
        WHERE proname IN ('keep_study_job_state', 'number_study_job_round', 'job_status_effect', 'study_job_round')
    `.execute(db)
    return rows.map((row) => row.name).sort()
}

describe('drop_study_job_state_triggers migration', () => {
    it('leaves only the round function that the backfill uses', async () => {
        expect(await installed()).toEqual(['study_job_round'])
    })

    it('puts the triggers back in down, so the earlier migration can still roll back', async () => {
        await down(migration)
        expect(await installed()).toEqual([
            'job_status_effect',
            'keep_study_job_state',
            'keep_study_job_state',
            'number_study_job_round',
            'number_study_job_round',
            'study_job_round',
        ])

        await up(migration)
        expect(await installed()).toEqual(['study_job_round'])
    })
})
