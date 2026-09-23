import { type Kysely, sql } from 'kysely'

// OTTER-698: written when the research lab opens a released outputs decision, so their pill can
// move from "Outputs need review" to "Outputs reviewed". A job status rather than a study column
// because a resubmission opens a new job, which resets the fact per round for free.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE study_job_status ADD VALUE 'RESULTS-VIEWED'`.execute(db)
}

// Postgres does not support removing enum values, so down is a no-op.
export async function down(_db: Kysely<unknown>): Promise<void> {}
