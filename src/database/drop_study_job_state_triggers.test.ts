import { db, describe, expect, it } from '@/tests/unit.helpers'
import { sql } from 'kysely'

const installed = async () => {
    const { rows } = await sql<{ name: string }>`
        SELECT tgname AS name FROM pg_trigger WHERE tgname IN ('keep_study_job_state', 'number_study_job_round')
        UNION ALL
        SELECT proname FROM pg_proc
        WHERE proname IN ('keep_study_job_state', 'number_study_job_round', 'job_status_effect', 'study_job_round')
    `.execute(db)
    return rows.map((row) => row.name).sort()
}

// Reads the catalog only. Running down() and up() here would lock job_status_change and study_job inside
// the test transaction, in the opposite order to other workers' fixtures, and could deadlock them.
describe('drop_study_job_state_triggers migration', () => {
    it('leaves only the round function that the backfill uses', async () => {
        expect(await installed()).toEqual(['study_job_round'])
    })
})
