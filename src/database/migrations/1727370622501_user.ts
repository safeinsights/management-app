import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('user')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('clerk_id', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('is_researcher', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema.createIndex('user_clerk_id_indx').on('user').column('clerk_id').unique().execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('user').execute()
}
