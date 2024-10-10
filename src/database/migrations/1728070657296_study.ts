import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('study_status').asEnum(['draft', 'proposal', 'approved', 'inactive']).execute()

    await db.schema
        .createTable('study')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('description', 'text', (col) => col.notNull())
        .addColumn('researcher_id', 'uuid', (col) => col.notNull())
        .addColumn('member_id', 'uuid', (col) => col.notNull().references('member.id'))
        .addColumn('pi_name', 'text', (col) => col.notNull())
        .addColumn('container_location', 'text', (col) => col.notNull())
        .addColumn('status', sql`study_status`, (col) => col.notNull().defaultTo('draft'))
        .addColumn('data_sources', sql`text[]`, (col) => col.notNull().defaultTo('{}'))
        .addColumn('output_mime_type', 'text')
        .addColumn('irb_protocols', 'text')
        .addColumn('approved_at', 'timestamp')

        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('study_member_indx').on('study').column('member_id').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('study').execute()
}
