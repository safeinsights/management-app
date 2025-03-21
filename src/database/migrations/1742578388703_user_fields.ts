import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('user').renameColumn('name', 'first_name').execute()
    await db.schema.alterTable('user').addColumn('last_name', 'text').execute()
    await db.schema.alterTable('user').addColumn('email', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('user').dropColumn('last_name').execute()
    await db.schema.alterTable('user').dropColumn('email').execute()
    await db.schema.alterTable('user').renameColumn('first_name', 'name').execute()
}
