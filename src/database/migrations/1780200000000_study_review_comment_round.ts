import { type Kysely, sql } from 'kysely'

// OTTER-638: resubmits revise the same job in place, so uniqueness moves from per-job to per-review
// round -- while still colliding two reviewers racing within one round (the OTTER-471 guard).
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_review_comment')
        .addColumn('round', 'integer', (col) => col.notNull().defaultTo(1))
        .execute()

    await db.schema.alterTable('study_job').addColumn('resubmission_round', 'integer').execute()

    // status is cast to text because comparing as the enum is an "unsafe use of new value of enum
    // type" when those values were added earlier in this same migration transaction.
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

    // Lossy: the one-decision-per-job constraint cannot be restored without dropping every round
    // but the latest.
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
