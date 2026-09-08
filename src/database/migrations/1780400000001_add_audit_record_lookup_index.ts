import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX audit_record_type_record_id_created_at_idx
        ON audit (record_type, record_id, created_at DESC)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_record_type_record_id_created_at_idx`.execute(db)
}
