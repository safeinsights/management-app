import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('pi_user_id', 'uuid', (col) => col.references('user.id'))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('pi_user_id').execute()
}
