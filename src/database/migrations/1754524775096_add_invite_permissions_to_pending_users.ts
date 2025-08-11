import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('pending_user')
        .addColumn('is_admin', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pending_user').dropColumn('is_admin').execute()
}
