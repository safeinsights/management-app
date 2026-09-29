import { type Kysely } from 'kysely'

// Without a failure row the reviewer poll cannot tell "still generating" from "failed" and spins
// until a blind timeout. report goes nullable because a failed generation has no report to store.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_review').addColumn('summary_failed_at', 'timestamptz').execute()
    await db.schema
        .alterTable('study_review')
        .alterColumn('report', (col) => col.dropNotNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_review')
        .alterColumn('report', (col) => col.setNotNull())
        .execute()
    await db.schema.alterTable('study_review').dropColumn('summary_failed_at').execute()
}
