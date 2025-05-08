import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('pending_user')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('organization_id', 'uuid', (col) => col.references('org.id').notNull())
        .addColumn('email', 'text', (col) => col.notNull())
        .addColumn('isResearcher', 'boolean', (col) => col.notNull())
        .addColumn('isReviewer', 'boolean', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema.createIndex('pending_user_org_id_idx').on('pending_user').column('organization_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('pending_user').execute()
}
