import { type Kysely, sql } from 'kysely'

// Convert legacy gen_random_uuid() defaults to v7uuid() and timestamp columns to timestamptz
// so the schema is consistent across all tables.

const UUID_DEFAULT_COLUMNS: Array<{ table: string; column: string }> = [
    { table: 'org_data_source', column: 'id' },
    { table: 'pending_user', column: 'id' },
    { table: 'researcher_position', column: 'id' },
]

const TIMESTAMP_COLUMNS: Array<{ table: string; column: string }> = [
    { table: 'audit', column: 'created_at' },
    { table: 'job_status_change', column: 'created_at' },
    { table: 'org', column: 'created_at' },
    { table: 'org', column: 'updated_at' },
    { table: 'org_code_env', column: 'created_at' },
    { table: 'org_user', column: 'joined_at' },
    { table: 'pending_user', column: 'created_at' },
    { table: 'researcher_position', column: 'created_at' },
    { table: 'researcher_position', column: 'updated_at' },
    { table: 'researcher_profile', column: 'created_at' },
    { table: 'researcher_profile', column: 'updated_at' },
    { table: 'study', column: 'approved_at' },
    { table: 'study', column: 'created_at' },
    { table: 'study', column: 'rejected_at' },
    { table: 'study', column: 'researcher_agreements_acked_at' },
    { table: 'study', column: 'reviewer_agreements_acked_at' },
    { table: 'study', column: 'submitted_at' },
    { table: 'study_job', column: 'created_at' },
    { table: 'study_job_file', column: 'created_at' },
    { table: 'user', column: 'created_at' },
    { table: 'user', column: 'updated_at' },
    { table: 'user_public_key', column: 'created_at' },
    { table: 'user_public_key', column: 'updated_at' },
    { table: 'yjs_document', column: 'updated_at' },
]

export async function up(db: Kysely<unknown>): Promise<void> {
    for (const { table, column } of UUID_DEFAULT_COLUMNS) {
        await sql`ALTER TABLE ${sql.id(table)} ALTER COLUMN ${sql.id(column)} SET DEFAULT v7uuid()`.execute(db)
    }

    for (const { table, column } of TIMESTAMP_COLUMNS) {
        await sql`
            ALTER TABLE ${sql.id(table)}
            ALTER COLUMN ${sql.id(column)} TYPE timestamptz
            USING ${sql.id(column)} AT TIME ZONE 'UTC'
        `.execute(db)
    }
}

export async function down(db: Kysely<unknown>): Promise<void> {
    for (const { table, column } of TIMESTAMP_COLUMNS) {
        await sql`
            ALTER TABLE ${sql.id(table)}
            ALTER COLUMN ${sql.id(column)} TYPE timestamp
            USING ${sql.id(column)} AT TIME ZONE 'UTC'
        `.execute(db)
    }

    for (const { table, column } of UUID_DEFAULT_COLUMNS) {
        await sql`ALTER TABLE ${sql.id(table)} ALTER COLUMN ${sql.id(column)} SET DEFAULT gen_random_uuid()`.execute(db)
    }
}
