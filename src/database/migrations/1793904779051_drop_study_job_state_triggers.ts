import { sql, type Kysely } from 'kysely'
import { EFFECT_FUNCTION, ROUND_TRIGGER, STATUS_TRIGGER } from './1793742916584_study_job_current_status'

// OTTER-973: the status writer is the only owner of the job state columns. A deploy swaps the code
// before it migrates, so no app code older than the columns writes after 1793742916584 has run.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TRIGGER IF EXISTS number_study_job_round ON study_job`.execute(db)
    await sql`DROP TRIGGER IF EXISTS keep_study_job_state ON job_status_change`.execute(db)
    await sql`DROP FUNCTION IF EXISTS number_study_job_round(), keep_study_job_state(), job_status_effect(text, text)`.execute(
        db,
    )
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql.raw(EFFECT_FUNCTION).execute(db)
    await sql.raw(STATUS_TRIGGER).execute(db)
    await sql.raw(ROUND_TRIGGER).execute(db)
}
