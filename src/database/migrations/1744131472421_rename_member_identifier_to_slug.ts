import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('member').renameColumn('identifier', 'slug').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('member').renameColumn('slug', 'identifier').execute()
}
