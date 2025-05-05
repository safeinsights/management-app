import { type Kysely, sql } from 'kysely'

// biome-ignore lint/suspicious/noExplicitAny: `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('audit_event_type').asEnum(['APPROVED', 'REJECTED']).execute()
    await db.schema.createType('audit_record_type').asEnum(['STUDY']).execute()
    await db.schema
        .createTable('audit')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('event_type', sql`audit_event_type`, (col) => col.notNull())
        .addColumn('record_id', 'text', (col) => col.notNull())
        .addColumn('record_type', sql`audit_record_type`, (col) => col.notNull())
        .addColumn('userId', 'text', (col) => col.notNull())
        .execute()
}

// biome-ignore lint/suspicious/noExplicitAny: `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('audit').execute()
}
