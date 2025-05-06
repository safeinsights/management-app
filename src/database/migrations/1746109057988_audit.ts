import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('audit_event_type').asEnum(['APPROVED', 'REJECTED']).execute()
    await db.schema.createType('audit_record_type').asEnum(['STUDY']).execute()
    await db.schema
        .createTable('audit')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('event_type', sql`audit_event_type`, (col) => col.notNull())
        .addColumn('record_id', 'uuid', (col) => col.notNull())
        .addColumn('record_type', sql`audit_record_type`, (col) => col.notNull())
        .addColumn('userId', 'uuid', (col) => col.notNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('audit').execute()
}
