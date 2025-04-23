import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_job').dropColumn('approved_at').dropColumn('rejected_at').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_job')
        .addColumn('approved_at', 'timestamp')
        .addColumn('rejected_at', 'timestamp')
        .execute()
}
