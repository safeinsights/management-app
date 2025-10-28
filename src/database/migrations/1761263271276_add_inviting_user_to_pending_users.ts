import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pending_user').addColumn('invited_by_user_id', 'uuid').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pending_user').dropColumn('invited_by_user_id').execute()
}
