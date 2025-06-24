import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`alter type study_job_status rename VALUE 'RESULTS-APPROVED' to 'FILES-APPROVED';`.execute(db)
    await sql`alter type study_job_status rename VALUE 'RESULTS-REJECTED' to 'FILES-REJECTED';`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`alter type study_job_status rename VALUE 'FILES-APPROVED' to 'RESULTS-APPROVED';`.execute(db)
    await sql`alter type study_job_status rename VALUE 'FILES-REJECTED' to 'RESULTS-REJECTED';`.execute(db)
}
