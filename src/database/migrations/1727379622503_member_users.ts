import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // see note in users file regarding expressing roles with boolean flags
    await db.schema
        .createTable('member_user')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('member_id', 'uuid', (col) => col.notNull().references('member.id'))
        .addColumn('is_reviewer', 'boolean', (col) => col.notNull())
        .addColumn('joined_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('is_admin', 'boolean', (col) => col.notNull())
        .execute()

    db.schema
        .createIndex('member_user_mbr_usrid_indx')
        .on('member_user')
        .columns(['member_id', 'user_id'])
        .unique()
        .execute()

    db.schema.createIndex('member_user_usrid_indx').on('member_user').column('user_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('member_user').execute()
}
