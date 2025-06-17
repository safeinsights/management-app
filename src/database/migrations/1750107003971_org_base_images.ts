import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('language').asEnum(['R']).execute()

    await db.schema
        .createTable('org_base_image')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('org_id', 'uuid', (col) => col.notNull().references('org.id').onDelete('cascade'))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('is_testing', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('language', sql`language`, (col) => col.notNull())
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('org_base_image').execute()

    await db.schema.dropType('language').execute()
}
