import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('member').renameTo('org').execute()
    await db.schema.alterTable('member_user').renameTo('org_user').execute()
    await db.schema.alterTable('study').renameColumn('member_id', 'org_id').execute()
    await db.schema.alterTable('org_user').renameColumn('member_id', 'org_id').execute()

    await db.schema
        .alterTable('org_user')
        .addColumn('isResearcher', 'boolean', (col) => col.defaultTo('true').notNull())
        .execute()
    await db.schema.alterTable('user').dropColumn('isResearcher').execute()
}

export async function down(): Promise<void> {
    throw new Error('irreverisible migration, change is too complex to attempt')
}
