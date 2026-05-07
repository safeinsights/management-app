import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE study_proposal_comment_entry_type
              ADD VALUE IF NOT EXISTS 'CODE-REVIEWER-FEEDBACK'`.execute(db)

    await db.schema
        .alterTable('study_proposal_comment')
        .addColumn('criteria', 'jsonb')
        .addColumn('study_job_id', 'uuid', (col) => col.references('study_job.id').onDelete('cascade'))
        .execute()

    await sql`
        CREATE FUNCTION study_proposal_comment_entry_type_as_text(study_proposal_comment_entry_type)
            RETURNS text
            LANGUAGE sql
            IMMUTABLE
            AS 'SELECT $1::text'
    `.execute(db)

    await sql`
        CREATE UNIQUE INDEX study_proposal_comment_one_code_review_per_job
            ON study_proposal_comment (study_job_id)
            WHERE study_proposal_comment_entry_type_as_text(entry_type) = 'CODE-REVIEWER-FEEDBACK'
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_proposal_comment_one_code_review_per_job').ifExists().execute()
    await sql`DROP FUNCTION IF EXISTS study_proposal_comment_entry_type_as_text(study_proposal_comment_entry_type)`.execute(
        db,
    )
    await db.schema.alterTable('study_proposal_comment').dropColumn('study_job_id').dropColumn('criteria').execute()
    // Postgres cannot cleanly drop an enum value. Leave it; harmless on rollback.
}
