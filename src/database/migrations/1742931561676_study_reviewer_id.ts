import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .dropColumn('reviewed_by')
        .addColumn('reviewer_id', 'uuid', (col) => col.references('user.id'))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('reviewed_by', 'uuid', (col) => col.references('user.id'))
        .execute()
    await db.schema.alterTable('study').dropColumn('reviewer_id').execute()
}
