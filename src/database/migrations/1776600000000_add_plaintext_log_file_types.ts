import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE study_job_file_type ADD VALUE IF NOT EXISTS 'SECURITY-SCAN-LOG'`.execute(db)
    await sql`ALTER TYPE study_job_file_type ADD VALUE IF NOT EXISTS 'PACKAGING-ERROR-LOG'`.execute(db)
}

// Postgres does not support removing enum values, so down is a no-op.
export async function down(_db: Kysely<unknown>): Promise<void> {}
