import { type Kysely, sql } from 'kysely'

// OTTER-675: the Data Partner's decision on a job's OUTPUTS (share the files + feedback, or
// share feedback only) is a third kind of review, alongside PROPOSAL and CODE. It carries the
// same shape as a CODE decision — a job, a round, a decision, a Lexical body — so it reuses
// study_review_comment rather than growing a parallel table. The existing
// (study_job_id, review_kind, round) unique constraint then gives outputs decisions the same
// one-per-round race guard code review relies on (OTTER-471).
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`alter type study_review_comment_kind add value 'RESULTS'`.execute(db)

    // Mirrors study_review_comment_code_requires_job: an outputs decision is always about one
    // job's files, so a NULL job id would silently escape the uniqueness constraint above.
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

    // study_review_comment_code_requires_job compares review_kind against the enum literal
    // 'CODE'. Retyping the column to text below would leave that check comparing text to the
    // enum type ("operator does not exist"), so it comes off first and goes back on at the end.
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
