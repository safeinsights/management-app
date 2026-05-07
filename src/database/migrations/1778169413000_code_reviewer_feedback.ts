import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE study_proposal_comment_entry_type
              ADD VALUE IF NOT EXISTS 'CODE-REVIEWER-FEEDBACK'`.execute(db)

    await db.schema
        .alterTable('study_proposal_comment')
        .addColumn('criteria', 'jsonb')
        .addColumn('study_job_id', 'uuid', (col) => col.references('study_job.id').onDelete('cascade'))
        .execute()

    // One code-review per job. Postgres allows multiple NULLs in a unique
    // index by default, which is exactly what we want: existing
    // REVIEWER-FEEDBACK / RESUBMISSION-NOTE rows always have study_job_id
    // NULL, and new CODE-REVIEWER-FEEDBACK rows must have study_job_id set.
    // A regular unique index avoids referencing the freshly added enum value
    // 'CODE-REVIEWER-FEEDBACK' in this same migration batch (Postgres rejects
    // that with "unsafe use of new value of enum type").
    await db.schema
        .createIndex('study_proposal_comment_one_code_review_per_job')
        .on('study_proposal_comment')
        .column('study_job_id')
        .unique()
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_proposal_comment_one_code_review_per_job').ifExists().execute()
    await db.schema.alterTable('study_proposal_comment').dropColumn('study_job_id').dropColumn('criteria').execute()
    // Postgres cannot cleanly drop an enum value. Leave it; harmless on rollback.
}
