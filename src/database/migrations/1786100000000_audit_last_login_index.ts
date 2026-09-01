import { type Kysely, sql } from 'kysely'

// Serves the last-login read on the acknowledgements table: the two filtered columns lead, leaving
// (record_id, created_at DESC) to supply the ordering, and both selected columns come from the index
// so the scan is index-only.
//
// Not a partial index on `WHERE event_type = 'LOGGED_IN'`, tempting as it is: an earlier migration
// adds that value with ALTER TYPE, and Postgres refuses to use a new enum value in the transaction
// that introduced it, so a fresh database fails to migrate.
//
// Does not supersede audit_record_type_record_id_created_at_idx: that one serves the per-record
// history query, which filters no event type and so cannot use an index with one in second place.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX audit_last_login_idx
        ON audit (record_type, event_type, record_id, created_at DESC)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_last_login_idx`.execute(db)
}
