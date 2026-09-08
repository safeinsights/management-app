import { type Kysely, sql } from 'kysely'

// OTTER-675: outputs decisions share a CODE decision's shape, so they reuse study_review_comment
// and inherit its one-per-round race guard (OTTER-471) rather than growing a parallel table.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`alter type study_review_comment_kind add value 'RESULTS'`.execute(db)

    // review_kind is cast to text because the value was added in this same transaction and
    // Postgres rejects comparing it as the enum ("unsafe use of new value of enum type").
    await sql`
        ALTER TABLE study_review_comment
            ADD CONSTRAINT study_review_comment_results_requires_job
            CHECK (review_kind::text <> 'RESULTS' OR study_job_id IS NOT NULL)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE study_review_comment
            DROP CONSTRAINT IF EXISTS study_review_comment_results_requires_job
    `.execute(db)

    // Dropped first and re-added at the end: retyping the column to text below would leave this
    // check comparing text against the enum type ("operator does not exist").
    await sql`
        ALTER TABLE study_review_comment
            DROP CONSTRAINT IF EXISTS study_review_comment_code_requires_job
    `.execute(db)

    await sql`DELETE FROM study_review_comment WHERE review_kind::text = 'RESULTS'`.execute(db)

    // Postgres cannot drop a single enum value, so the type is rebuilt without it.
    await sql`ALTER TABLE study_review_comment ALTER COLUMN review_kind TYPE text`.execute(db)
    await sql`DROP TYPE study_review_comment_kind`.execute(db)
    await sql`CREATE TYPE study_review_comment_kind AS ENUM ('PROPOSAL', 'CODE')`.execute(db)
    await sql`
        ALTER TABLE study_review_comment
            ALTER COLUMN review_kind TYPE study_review_comment_kind
            USING review_kind::study_review_comment_kind
    `.execute(db)

    await sql`
        ALTER TABLE study_review_comment
            ADD CONSTRAINT study_review_comment_code_requires_job
            CHECK (review_kind <> 'CODE' OR study_job_id IS NOT NULL)
    `.execute(db)
}
