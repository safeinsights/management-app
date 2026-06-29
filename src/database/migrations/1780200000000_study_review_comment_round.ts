import { type Kysely, sql } from 'kysely'

// OTTER-638: a CODE-CHANGES-REQUESTED resubmit revises the SAME job in place (OTTER-316), so a
// second review round lands on the same study_job. The old unique constraint
// (study_job_id, review_kind) permitted only one CODE decision per job for its lifetime, which
// wrongly blocked the reviewer's decision on resubmitted code with a duplicate-key error. Scope
// uniqueness to the review ROUND instead: each round on a job gets its own decision row, while two
// reviewers racing within the SAME round still collide (preserving the OTTER-471 race-loser guard).
// `round` is the study-wide submission version (see codeSubmissionVersion) at decision time, and
// study_job.resubmission_round records the same version for the resubmission note that opened a
// round, so the feedback panel labels a round's note and decision with the same version.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_review_comment')
        .addColumn('round', 'integer', (col) => col.notNull().defaultTo(1))
        .execute()

    await db.schema.alterTable('study_job').addColumn('resubmission_round', 'integer').execute()

    // Backfill each CODE row to the study-wide round it belonged to, as-of its own created_at:
    // 1 + the number of round-opening events recorded before it. PROPOSAL rows keep the default 1.
    // jsc.status is cast to text so the literals stay text: comparing them as the enum would be an
    // "unsafe use of new value of enum type" when those values were added earlier in this same
    // migration transaction (the migrator runs all pending migrations in one transaction).
    await sql`
        UPDATE study_review_comment src
        SET round = 1 + (
            SELECT count(*)
            FROM job_status_change jsc
            JOIN study_job sj ON sj.id = jsc.study_job_id
            WHERE sj.study_id = src.study_id
              AND jsc.status::text IN ('CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED')
              AND jsc.created_at < src.created_at
        )
        WHERE src.review_kind::text = 'CODE'
    `.execute(db)

    // Backfill the resubmission note's round the same way, as-of the job's latest code submission.
    await sql`
        UPDATE study_job j
        SET resubmission_round = 1 + (
            SELECT count(*)
            FROM job_status_change roe
            JOIN study_job sj ON sj.id = roe.study_job_id
            WHERE sj.study_id = j.study_id
              AND roe.status::text IN ('CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED')
              AND roe.created_at < (
                  SELECT max(cs.created_at)
                  FROM job_status_change cs
                  WHERE cs.study_job_id = j.id AND cs.status::text = 'CODE-SUBMITTED'
              )
        )
        WHERE j.resubmission_note IS NOT NULL
    `.execute(db)

    await db.schema
        .alterTable('study_review_comment')
        .dropConstraint('study_review_comment_one_code_review_per_job')
        .execute()

    // study_job_id is NULL for PROPOSAL rows; Postgres treats NULLs as distinct, so those stay
    // unrestricted. CODE rows always carry a job id (existing CHECK), so this keys per round.
    await db.schema
        .alterTable('study_review_comment')
        .addUniqueConstraint('study_review_comment_one_code_review_per_round', ['study_job_id', 'review_kind', 'round'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_review_comment')
        .dropConstraint('study_review_comment_one_code_review_per_round')
        .execute()

    // Restoring the one-decision-per-job constraint requires collapsing any multi-round history: keep
    // each (job, kind) group's latest round and drop the earlier ones, otherwise re-adding the unique
    // constraint would fail on rows this feature legitimately created.
    await sql`
        DELETE FROM study_review_comment a
        USING study_review_comment b
        WHERE a.study_job_id = b.study_job_id
          AND a.review_kind = b.review_kind
          AND a.study_job_id IS NOT NULL
          AND a.round < b.round
    `.execute(db)

    await db.schema
        .alterTable('study_review_comment')
        .addUniqueConstraint('study_review_comment_one_code_review_per_job', ['study_job_id', 'review_kind'])
        .execute()

    await db.schema.alterTable('study_job').dropColumn('resubmission_round').execute()

    await db.schema.alterTable('study_review_comment').dropColumn('round').execute()
}
