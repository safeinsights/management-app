import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('member_user_public_key')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('value', 'text', (col) => col.notNull())
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema
        .createIndex('member_user_public_key_fingerpring_indx')
        .on('member_user_public_key')
        .column('fingerprint')
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('member_user_public_key').execute()
}
