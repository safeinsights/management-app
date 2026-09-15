import { type Kysely, sql } from 'kysely'

/**
 * OTTER-693: lets the audit trail record that someone has been shown something, which is what the
 * Submit code page's FAQ keys its one-time expansion off. Generic on purpose — the next "has this
 * researcher seen X" feature should reuse this value and distinguish itself in `metadata` rather
 * than adding another event type.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE audit_event_type ADD VALUE 'VIEWED'`.execute(db)
}

// Postgres does not support removing enum values, so down is a no-op.
export async function down(_db: Kysely<unknown>): Promise<void> {}
