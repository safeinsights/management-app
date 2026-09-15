import { type Kysely, sql } from 'kysely'

/**
 * OTTER-693: lets the audit trail record that someone has been shown something, which is what the
 * Submit code page's FAQ keys its one-time expansion off. Generic on purpose — the next "has this
 * researcher seen X" feature should reuse this value and distinguish itself in `metadata` rather
 * than adding another event type.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    // IF NOT EXISTS because this migration was renumbered off a timestamp main had taken, and
    // kysely keys applied migrations by filename — a database that ran the old name re-runs this.
    await sql`ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'VIEWED'`.execute(db)
}

// Postgres does not support removing enum values, so down is a no-op.
export async function down(_db: Kysely<unknown>): Promise<void> {}
