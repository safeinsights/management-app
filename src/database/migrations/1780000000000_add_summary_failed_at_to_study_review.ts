import { type Kysely } from 'kysely'

// Records when automated summary generation failed for a job. A failure
// previously wrote no row at all, so the reviewer-side poll could not tell
// "still generating" from "failed" and spun until a blind timeout. A row with
// summary_failed_at set is a terminal failure the client can surface (and
// retry) immediately. NULL means not failed.
//
// report is also relaxed to nullable: a failed generation has no report to
// store, and the unique (study_job_id) index keeps it to one row per job.
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
