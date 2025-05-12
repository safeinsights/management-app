import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pending_user').addColumn('claimed_by_user_id', 'uuid').execute()
    await db.schema.alterTable('pending_user').renameColumn('organization_id', 'org_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pending_user').renameColumn('org_id', 'organization_id').execute()
    await db.schema.alterTable('pending_user').dropColumn('claimed_by_user_id').execute()
}
