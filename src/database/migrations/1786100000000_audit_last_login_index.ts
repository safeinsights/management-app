import { type Kysely, sql } from 'kysely'

// The acknowledgements table reads each user's most recent LOGGED_IN row, which is the first read
// this event type has ever had. Partial rather than a plain composite so event_type is satisfied by
// the predicate and the two selected columns come from the index itself: without it Postgres
// heap-fetches every USER audit row just to check the event type.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX audit_last_login_idx
        ON audit (record_id, created_at DESC)
        WHERE record_type = 'USER' AND event_type = 'LOGGED_IN'
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_last_login_idx`.execute(db)
}
