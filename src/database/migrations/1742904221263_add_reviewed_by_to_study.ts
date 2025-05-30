import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('reviewed_by', 'uuid', (col) => col.references('user.id'))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('reviewed_by').execute()
}
