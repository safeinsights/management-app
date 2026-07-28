import { type Kysely, sql } from 'kysely'

// Must be the only statement in this migration: Postgres forbids using a newly added
// enum value in the same transaction that adds it, and each migration runs in one.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE audit_record_type ADD VALUE 'CODE_ENV'`.execute(db)
}

// Postgres does not support removing enum values, so down is a no-op.
export async function down(_db: Kysely<unknown>): Promise<void> {}
