import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('yjs_document')
        .addColumn('name', 'text', (col) => col.primaryKey())
        .addColumn('data', 'bytea', (col) => col.notNull())
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('yjs_document').execute()
}
