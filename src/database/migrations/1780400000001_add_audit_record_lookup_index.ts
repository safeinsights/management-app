import { type Kysely, sql } from 'kysely'

// audit is append-only and grows with every login, so the per-record history query
// (filter on record_type + record_id, newest first) needs to stay off a seq scan.
// created_at is part of the index so the ordering is satisfied without a sort.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX audit_record_type_record_id_created_at_idx
        ON audit (record_type, record_id, created_at DESC)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_record_type_record_id_created_at_idx`.execute(db)
}
