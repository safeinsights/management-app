import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('pi_user_id', 'uuid', (col) => col.references('user.id'))
        .execute()

    await sql`UPDATE study SET pi_user_id = researcher_id, pi_name = (SELECT full_name FROM "user" WHERE id = researcher_id)`.execute(
        db,
    )
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('pi_user_id').execute()
}
