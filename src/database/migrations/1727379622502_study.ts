import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('researcher_id', 'uuid', (col) => col.notNull())
        .addColumn('member_id', 'uuid', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('data_sources', 'text', (col) => col.notNull())
        .addColumn('output_formats', 'text', (col) => col.notNull())
        .addColumn('container_location', 'text', (col) => col.notNull())
        .addColumn('irb_protocols', 'text')
        .addColumn('approved_at', 'timestamp')
        .addColumn('approved_by_member_id', 'uuid')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('study').execute()
}
